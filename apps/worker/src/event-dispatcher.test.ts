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
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' }, notionToken: 'ntn' })
    .returning()
    .get().id;
  storeNotionSchema(db, projectId, 'ds', {
    title: 'Roadmap',
    properties: [{ id: 'p%3Ar', name: 'PR', type: 'url', options: [] }],
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
  const ticket = createTicket(db, { projectId, title: 'Search', notionPageId });
  db.update(schema.tickets).set({ prNumber: 7 }).where(eq(schema.tickets.id, ticket.id)).run();
  emitEvent(db, { type: 'pull_request_opened', ticketId: ticket.id, payload: { number: 7 } });
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
