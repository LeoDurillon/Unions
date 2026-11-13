// Tests setting a Jira issue's field by hand: the fields sent, a status moved, the active sprint resolved, refusals.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  JiraError,
  migrateDb,
  saveIntegration,
  schema,
  type Db,
  type JiraApi,
  type TrackerFieldSet,
} from '@union/core';

import { setJiraField } from './field-set';

let db: Db;
let projectId: number;
let ticketId: number;
let calls: unknown[];
let failure: Error | null;

const jira = {
  updateIssue: (_auth, key, body) => {
    calls.push(['update', key, body]);
    return failure ? Promise.reject(failure) : Promise.resolve();
  },
  transitionIssue: (_auth, key, transitionId) => {
    calls.push(['move', key, transitionId]);
    return failure ? Promise.reject(failure) : Promise.resolve();
  },
  read: (_auth, path) => {
    calls.push(['read', path]);
    if (path.includes('/board?')) {
      return Promise.resolve({ values: [{ id: 3, type: 'scrum' }] });
    }
    return Promise.resolve({ values: [{ id: 42, name: 'Sprint 12', state: 'active' }] });
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
  const config = { site: 'https://acme.atlassian.net', email: 'a@b.c', projectKey: 'ABC' };
  saveIntegration(db, projectId, 'jira', { secret: 'tok', config });
  ticketId = createTicket(db, { projectId, title: 'Dark mode' }).id;
  calls = [];
  failure = null;
});

function change(
  field: { id: string; type: string },
  value: string,
  picks: TrackerFieldSet['picks'] = [],
): TrackerFieldSet {
  return {
    projectId,
    kind: 'jira',
    itemId: 'ABC-1',
    ticketId,
    reviewId: null,
    field: { name: field.id, options: [], ...field },
    value,
    text: value,
    picks,
  };
}

function lastEvent(): { type: string; payload: unknown } | undefined {
  return db.select().from(schema.events).all().at(-1);
}

test('labels are set as a whole and a user by account id, then logged', async () => {
  await setJiraField(db, jira, 1, change({ id: 'labels', type: 'labels' }, 'ui, qa'));
  await setJiraField(
    db,
    jira,
    2,
    change({ id: 'assignee', type: 'user' }, '', [{ id: 'a1', name: 'Ada' }]),
  );
  expect(calls).toEqual([
    ['update', 'ABC-1', { fields: { labels: ['ui', 'qa'] }, update: {} }],
    ['update', 'ABC-1', { fields: { assignee: { accountId: 'a1' } }, update: {} }],
  ]);
  expect(lastEvent()).toMatchObject({
    type: 'tracker_field_set',
    payload: { commandId: 2, kind: 'jira', itemId: 'ABC-1', fieldId: 'assignee' },
  });
});

test('the status moves with the picked transition', async () => {
  await setJiraField(
    db,
    jira,
    3,
    change({ id: 'status', type: 'status' }, 'Done', [{ id: '31', name: 'Done' }]),
  );
  expect(calls).toEqual([['move', 'ABC-1', '31']]);
  expect(lastEvent()?.type).toBe('tracker_field_set');
});

test('"the active sprint" is the board’s now', async () => {
  const field = { id: 'customfield_10020', type: 'sprint' };
  await setJiraField(db, jira, 4, change(field, '', [{ id: 'active', name: 'Active sprint' }]));
  expect(calls.at(-1)).toEqual([
    'update',
    'ABC-1',
    { fields: { customfield_10020: 42 }, update: {} },
  ]);
});

test('a refusal names the permission; a bad value is not sent', async () => {
  failure = new JiraError('Forbidden', 403);
  await setJiraField(
    db,
    jira,
    5,
    change({ id: 'status', type: 'status' }, 'Done', [{ id: '31', name: 'Done' }]),
  );
  expect(JSON.stringify(lastEvent()?.payload)).toContain('Transition issues');
  failure = null;
  calls = [];
  await setJiraField(db, jira, 6, change({ id: 'customfield_1', type: 'number' }, 'many'));
  expect(calls).toEqual([]);
  expect(lastEvent()).toMatchObject({
    type: 'tracker_field_failed',
    payload: { error: '"many" is not a number' },
  });
});
