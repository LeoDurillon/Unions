// Tests the "Notify me in Union" action: a rule's notification beside the built-in one, once per rule and event.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  deleteRule,
  emitEvent,
  migrateDb,
  queueDeliveries,
  recentDeliveries,
  saveRule,
  schema,
  type Db,
  type NotionApi,
  type Ticket,
} from '@union/core';
import { asc } from 'drizzle-orm';

import { EventDispatcher } from './event-dispatcher';
import { writeNotifications } from './notifier';

let db: Db;
let projectId: number;
let ticket: Ticket;
let ruleId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticket = createTicket(db, { projectId, title: 'Search page' });
  // Both readers of the log start here.
  queueDeliveries(db);
  writeNotifications(db);
  ruleId = saveRule(db, projectId, {
    name: 'Merged',
    enabled: true,
    trigger: { kind: 'pull_request_merged' },
    action: { kind: 'union_notification', message: 'Shipped: {pr.url}' },
  }).id;
});

async function dispatch(): Promise<void> {
  const dispatcher = new EventDispatcher(db, {} as NotionApi);
  dispatcher.tick();
  await dispatcher.idle();
}

function rows(): (typeof schema.notifications.$inferSelect)[] {
  return db.select().from(schema.notifications).orderBy(asc(schema.notifications.id)).all();
}

test("a rule notifies under the ticket's title, beside the built-in notification of the same event", async () => {
  db.update(schema.tickets).set({ prNumber: 7 }).run();
  emitEvent(db, { type: 'pull_request_merged', ticketId: ticket.id, payload: { number: 7 } });
  await dispatch();
  await dispatch();
  expect(rows().map((row) => [row.kind, row.ruleId, row.title, row.detail])).toEqual([
    ['pull_request_merged', null, 'Search page', '#7 was merged.'],
    ['rule', ruleId, 'Search page', 'Shipped: https://github.com/acme/shop/pull/7'],
  ]);
  expect(recentDeliveries(db, projectId).map((delivery) => delivery.status)).toEqual(['succeeded']);
  const announced = db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type === 'notification_created');
  expect(announced).toHaveLength(2);
});

test('its notification stays when the rule is deleted', async () => {
  emitEvent(db, { type: 'pull_request_merged', ticketId: ticket.id, payload: { number: 7 } });
  await dispatch();
  expect(deleteRule(db, projectId, ruleId)).toBe(true);
  expect(rows().map((row) => [row.kind, row.ruleId])).toEqual([
    ['pull_request_merged', null],
    ['rule', ruleId],
  ]);
});
