import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  emitEvent,
  JiraError,
  migrateDb,
  queueDeliveries,
  recentDeliveries,
  saveIntegration,
  schema,
  type Db,
  type EventAction,
  type JiraApi,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { EventDispatcher } from '../event-dispatcher';

const PR_URL = 'https://github.com/acme/shop/pull/7';
const TO_DO = { id: '1', name: 'To Do' };

let db: Db;
let projectId: number;
let calls: { call: string; key: string; detail?: unknown }[];
let current: { id: string; name: string };
let failure: Error | null;

const jira = {
  issueStatus: (_auth, key) => {
    calls.push({ call: 'issueStatus', key });
    return Promise.resolve(current);
  },
  transitions: (_auth, key) => {
    calls.push({ call: 'transitions', key });
    return Promise.resolve([{ id: '31', name: 'Start review', toId: '3', toName: 'In Review' }]);
  },
  transitionIssue: (_auth, key, transitionId) => {
    calls.push({ call: 'transitionIssue', key, detail: transitionId });
    return failure ? Promise.reject(failure) : Promise.resolve();
  },
  editMeta: () =>
    Promise.resolve({
      customfield_1: { allowedValues: null },
      customfield_2: { allowedValues: null },
      customfield_3: { allowedValues: ['Low', 'High'] },
      labels: { allowedValues: null },
    }),
  updateIssue: (_auth, key, change) => {
    calls.push({ call: 'updateIssue', key, detail: change });
    return failure ? Promise.reject(failure) : Promise.resolve();
  },
  addComment: (auth, key, body) => {
    calls.push({ call: 'addComment', key, detail: { body, token: auth.token } });
    return failure ? Promise.reject(failure) : Promise.resolve();
  },
} satisfies Partial<JiraApi> as unknown as JiraApi;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const config = { site: 'https://acme.atlassian.net', email: 'ada@acme.com', projectKey: 'ABC' };
  saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  // The log is read from here on.
  queueDeliveries(db);
  calls = [];
  current = TO_DO;
  failure = null;
});

/** A rule on "the ticket gets a pull request" (saved as the settings route will save it, once it offers Jira). */
function rule(action: EventAction): void {
  db.insert(schema.eventRules)
    .values({
      projectId,
      name: 'Jira',
      enabled: true,
      trigger: { kind: 'pull_request_linked' },
      action,
    })
    .run();
}

function openPullRequest(jiraKey: string | null = 'ABC-1'): void {
  const origin =
    jiraKey === null
      ? undefined
      : { kind: 'jira' as const, id: jiraKey, url: `https://acme.atlassian.net/browse/${jiraKey}` };
  const ticket = createTicket(db, { projectId, title: 'Search', origin });
  db.update(schema.tickets).set({ prNumber: 7 }).where(eq(schema.tickets.id, ticket.id)).run();
  emitEvent(db, {
    type: 'pull_request_opened',
    ticketId: ticket.id,
    payload: { number: 7, url: PR_URL },
  });
}

async function dispatch(): Promise<void> {
  const dispatcher = new EventDispatcher(db, {} as never, () => null, jira);
  dispatcher.tick();
  await dispatcher.idle();
}

function lastDelivery(): unknown {
  return recentDeliveries(db, projectId)[0];
}

const MOVE: EventAction = { kind: 'jira_transition', statusId: '3', statusName: 'In Review' };

test("the ticket's issue moves through the transition that leads to the status", async () => {
  rule(MOVE);
  openPullRequest();
  await dispatch();
  expect(calls.map((call) => call.call)).toEqual(['issueStatus', 'transitions', 'transitionIssue']);
  expect(calls[2]).toEqual({ call: 'transitionIssue', key: 'ABC-1', detail: '31' });
  expect(lastDelivery()).toMatchObject({
    status: 'succeeded',
    detail: 'Moved ABC-1 from To Do to In Review',
  });
});

test('an issue already in the status is left alone; one with no way there fails', async () => {
  rule(MOVE);
  current = { id: '3', name: 'In Review' };
  openPullRequest();
  await dispatch();
  expect(calls.map((call) => call.call)).toEqual(['issueStatus']);
  expect(lastDelivery()).toMatchObject({
    status: 'succeeded',
    detail: 'ABC-1 is already In Review',
  });

  current = { id: '9', name: 'Backlog' };
  calls = [];
  rule({ ...MOVE, statusId: '4', statusName: 'Done' });
  openPullRequest('ABC-2');
  await dispatch();
  const deliveries = recentDeliveries(db, projectId);
  expect(deliveries.map((delivery) => delivery.status)).toContain('failed');
  expect(deliveries.find((delivery) => delivery.status === 'failed')).toMatchObject({
    error: "No transition from Backlog to Done in the issue's workflow",
  });
});

test('a ticket not imported from Jira is skipped', async () => {
  rule(MOVE);
  openPullRequest(null);
  await dispatch();
  expect(calls).toEqual([]);
  expect(lastDelivery()).toMatchObject({
    status: 'skipped',
    detail: 'The ticket was not imported from Jira',
  });
});

test("rate limits and outages are tried again; a refusal fails with Jira's reason or the permission", async () => {
  rule(MOVE);
  failure = new JiraError('Jira is limiting requests: try again in 30 s.', 429);
  openPullRequest();
  await dispatch();
  expect(lastDelivery()).toMatchObject({ status: 'pending', attempts: 1 });

  db.delete(schema.eventDeliveries).run();
  failure = new JiraError('Jira: Resolution is required.', 400);
  openPullRequest('ABC-2');
  await dispatch();
  expect(lastDelivery()).toMatchObject({
    status: 'failed',
    error: 'Jira: Resolution is required.',
    detail: 'Tried: move ABC-2 to In Review',
  });

  db.delete(schema.eventDeliveries).run();
  failure = new JiraError('This Jira account is not allowed to see this.', 403);
  openPullRequest('ABC-3');
  await dispatch();
  expect(lastDelivery()).toMatchObject({
    status: 'failed',
    error: 'Jira refused: the account needs the "Transition issues" permission in the Jira project',
  });
});

const FIELDS: Extract<EventAction, { kind: 'jira_field' }> = {
  kind: 'jira_field',
  values: [
    { fieldId: 'customfield_1', fieldName: 'PR link', fieldType: 'text', value: '{pr.url}' },
    { fieldId: 'customfield_2', fieldName: 'Points', fieldType: 'number', value: '3' },
    { fieldId: 'customfield_3', fieldName: 'Priority', fieldType: 'option', value: 'High' },
    { fieldId: 'labels', fieldName: 'Labels', fieldType: 'labels', value: 'qa, in-review' },
  ],
};

test('fields are set and labels added in one request', async () => {
  rule(FIELDS);
  openPullRequest();
  await dispatch();
  expect(calls).toEqual([
    {
      call: 'updateIssue',
      key: 'ABC-1',
      detail: {
        fields: { customfield_1: PR_URL, customfield_2: 3, customfield_3: { value: 'High' } },
        update: { labels: [{ add: 'qa' }, { add: 'in-review' }] },
      },
    },
  ]);
  expect(lastDelivery()).toMatchObject({
    status: 'succeeded',
    detail: `ABC-1: PR link set to "${PR_URL}", Points set to "3", Priority set to "High", Labels: added qa, in-review`,
  });
});

test("a value the issue's edit screen refuses fails before anything is sent", async () => {
  const [link, , priority] = FIELDS.values;
  if (!link || !priority) {
    throw new Error('Fields');
  }
  rule({ kind: 'jira_field', values: [link, { ...priority, value: 'Urgent' }] });
  openPullRequest();
  await dispatch();
  expect(calls).toEqual([]);
  expect(lastDelivery()).toMatchObject({
    status: 'failed',
    error: 'Priority: "Urgent" is not one of its options (Low, High)',
  });

  db.delete(schema.eventDeliveries).run();
  db.delete(schema.eventRules).run();
  rule({ kind: 'jira_field', values: [{ ...link, fieldId: 'customfield_9', fieldName: 'Gone' }] });
  openPullRequest('ABC-2');
  await dispatch();
  expect(lastDelivery()).toMatchObject({
    status: 'failed',
    error: "Gone is not on the issue's edit screen",
  });
});

test('a comment is sent as rich text with its link, with the stored token', async () => {
  rule({ kind: 'jira_comment', body: 'Ready for QA: {pr.url}' });
  openPullRequest();
  await dispatch();
  expect(calls).toEqual([
    {
      call: 'addComment',
      key: 'ABC-1',
      detail: {
        token: 'tok',
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Ready for QA: ' },
                { type: 'text', text: PR_URL, marks: [{ type: 'link', attrs: { href: PR_URL } }] },
              ],
            },
          ],
        },
      },
    },
  ]);
  expect(lastDelivery()).toMatchObject({
    status: 'succeeded',
    detail: `Commented on ABC-1: Ready for QA: ${PR_URL}`,
  });

  db.delete(schema.eventDeliveries).run();
  failure = new JiraError('This Jira account is not allowed to see this.', 403);
  openPullRequest('ABC-2');
  await dispatch();
  expect(lastDelivery()).toMatchObject({
    status: 'failed',
    error: 'Jira refused: the account needs the "Add comments" permission in the Jira project',
  });
});
