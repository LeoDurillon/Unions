import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  emitEvent,
  migrateDb,
  NotionError,
  queueDeliveries,
  recentDeliveries,
  saveRule,
  schema,
  saveNotionConnection,
  storeNotionSchema,
  type Db,
  type NotionApi,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { EventDispatcher } from './event-dispatcher';

let db: Db;
let projectId: number;
let updates: { pageId: string; properties: Record<string, unknown> }[];
let failure: Error | null;

const notion = {
  updatePage: (_token: string, pageId: string, properties: Record<string, unknown>) => {
    if (failure) {
      return Promise.reject(failure);
    }
    updates.push({ pageId, properties });
    return Promise.resolve();
  },
} as unknown as NotionApi;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'ntn', dataSourceId: 'ds' });
  storeNotionSchema(db, projectId, {
    title: 'Roadmap',
    properties: [
      { id: 'p%3Ar', name: 'PR', type: 'url', options: [] },
      { id: 's%3At', name: 'Status', type: 'status', options: ['Todo', 'In review'] },
      { id: 'n%3Ab', name: 'Number', type: 'number', options: [] },
    ],
  });
  // The log is read from here on.
  queueDeliveries(db);
  saveRule(db, projectId, {
    name: 'PR link',
    enabled: true,
    trigger: { kind: 'pull_request_linked' },
    action: { kind: 'notion_property', propertyId: 'p%3Ar', value: '{pr.url}' },
  });
  updates = [];
  failure = null;
});

function openPullRequest(notionPageId?: string): void {
  const origin = notionPageId ? { kind: 'notion' as const, id: notionPageId, url: '' } : undefined;
  const ticket = createTicket(db, { projectId, title: 'Search', origin });
  db.update(schema.tickets).set({ prNumber: 7 }).where(eq(schema.tickets.id, ticket.id)).run();
  emitEvent(db, {
    type: 'pull_request_opened',
    ticketId: ticket.id,
    payload: { number: 7, url: '' },
  });
}

async function dispatch(): Promise<void> {
  const dispatcher = new EventDispatcher(db, notion);
  dispatcher.tick();
  await dispatcher.idle();
}

test("the pull request's link is set on the ticket's Notion page", async () => {
  openPullRequest('page-1');
  await dispatch();
  expect(updates).toEqual([
    { pageId: 'page-1', properties: { 'p%3Ar': { url: 'https://github.com/acme/shop/pull/7' } } },
  ]);
  expect(recentDeliveries(db, projectId)).toMatchObject([
    { status: 'succeeded', detail: 'PR set to "https://github.com/acme/shop/pull/7"' },
  ]);
  const logged = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.type, 'event_rule_applied'))
    .all();
  expect(logged).toHaveLength(1);
});

test('a ticket not imported from Notion is skipped', async () => {
  openPullRequest();
  await dispatch();
  expect(updates).toEqual([]);
  expect(recentDeliveries(db, projectId)).toMatchObject([
    { status: 'skipped', detail: 'The ticket was not imported from Notion' },
  ]);
});

test('a rate limit is tried again later; a refusal fails at once', async () => {
  openPullRequest('page-1');
  failure = new NotionError('Notion: rate limited', 429);
  await dispatch();
  expect(recentDeliveries(db, projectId)).toMatchObject([
    { status: 'pending', attempts: 1, error: 'Notion: rate limited' },
  ]);

  openPullRequest('page-2');
  failure = new NotionError('Notion: PR is expected to be url.', 400);
  await dispatch();
  expect(recentDeliveries(db, projectId)[0]).toMatchObject({
    status: 'failed',
    error: 'Notion: PR is expected to be url.',
  });
});

/** The only rule: on a pull request, set these properties. */
function onlyRule(values: { propertyId: string; value: string }[]): void {
  db.delete(schema.eventRules).run();
  saveRule(db, projectId, {
    name: 'PR in Notion',
    enabled: true,
    trigger: { kind: 'pull_request_linked' },
    action: { kind: 'notion_property', values },
  });
}

test('a rule sets several properties of the page in one request', async () => {
  onlyRule([
    { propertyId: 'p%3Ar', value: '{pr.url}' },
    { propertyId: 's%3At', value: 'In review' },
    { propertyId: 'n%3Ab', value: '{pr.number}' },
  ]);
  openPullRequest('page-1');
  await dispatch();
  expect(updates).toEqual([
    {
      pageId: 'page-1',
      properties: {
        'p%3Ar': { url: 'https://github.com/acme/shop/pull/7' },
        's%3At': { status: { name: 'In review' } },
        'n%3Ab': { number: 7 },
      },
    },
  ]);
  expect(recentDeliveries(db, projectId)).toMatchObject([
    {
      status: 'succeeded',
      detail:
        'PR set to "https://github.com/acme/shop/pull/7", Status set to "In review", Number set to "7"',
    },
  ]);
});

test('one value that cannot be set fails the whole delivery, naming its property', async () => {
  onlyRule([
    { propertyId: 'p%3Ar', value: '{pr.url}' },
    { propertyId: 'n%3Ab', value: '{pr.url}' },
  ]);
  openPullRequest('page-1');
  await dispatch();
  expect(updates).toEqual([]);
  expect(recentDeliveries(db, projectId)).toMatchObject([
    { status: 'failed', error: 'Number: "https://github.com/acme/shop/pull/7" is not a number' },
  ]);
});

function postReview(
  prNumber: number,
  notionPageId: string | null,
  verdict: 'approve' | 'request_changes',
): void {
  const reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber,
      title: 't',
      url: 'u',
      author: 'a',
      headBranch: 'h',
      baseBranch: 'main',
      notionPageId,
    })
    .returning()
    .get().id;
  emitEvent(db, {
    type: 'pr_review_posted',
    payload: { reviewId, number: prNumber, url: 'u#r1', verdict },
  });
}

test("a posted review sets the review's own Notion page; other verdicts do nothing", async () => {
  saveRule(db, projectId, {
    name: 'Changes requested',
    enabled: true,
    trigger: { kind: 'pull_request_reviewed', verdict: 'request_changes' },
    action: { kind: 'notion_property', propertyId: 's%3At', value: 'Todo' },
  });
  postReview(12, 'page-r', 'request_changes');
  await dispatch();
  expect(updates).toEqual([
    { pageId: 'page-r', properties: { 's%3At': { status: { name: 'Todo' } } } },
  ]);
  postReview(13, null, 'request_changes');
  postReview(14, 'page-r', 'approve');
  await dispatch();
  expect(updates).toHaveLength(1);
  expect(recentDeliveries(db, projectId)[0]).toMatchObject({
    status: 'skipped',
    detail: 'The pull request is not linked to a Notion page',
  });
});
