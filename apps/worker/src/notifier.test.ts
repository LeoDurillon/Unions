import { beforeEach, expect, test } from 'bun:test';

import {
  createTicket,
  createDb,
  emitEvent,
  isEvent,
  migrateDb,
  schema,
  type Db,
  type Ticket,
} from '@union/core';
import { asc, eq } from 'drizzle-orm';

import { writeNotifications } from './notifier';

let db: Db;
let projectId: number;
let ticket: Ticket;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticket = createTicket(db, { projectId, title: 'Search page' });
});

function waitForApproval(ticketId: number): void {
  emitEvent(db, {
    type: 'phase_changed',
    ticketId,
    payload: {
      from: { kind: 'running', step: 'summary' },
      to: { kind: 'awaiting_approval', step: 'summary' },
      action: 'run_finished',
      board: 'in_review',
    },
  });
}

function rows(): (typeof schema.notifications.$inferSelect)[] {
  return db.select().from(schema.notifications).orderBy(asc(schema.notifications.id)).all();
}

test('the first read starts at the end of the log: the past does not notify', () => {
  waitForApproval(ticket.id);
  expect(writeNotifications(db)).toBe(0);
  expect(rows()).toEqual([]);
});

test('each event that needs the user notifies once, and is announced on the stream', () => {
  writeNotifications(db);
  waitForApproval(ticket.id);
  emitEvent(db, { type: 'run_started', ticketId: ticket.id, payload: { step: 'intake' } });
  emitEvent(db, { type: 'pull_request_merged', ticketId: ticket.id, payload: { number: 7 } });

  expect(writeNotifications(db)).toBe(2);
  expect(writeNotifications(db)).toBe(0);
  expect(
    rows().map((row) => [row.kind, row.title, row.projectId, row.ticketId, row.readAt]),
  ).toEqual([
    ['awaiting_approval', 'Search page', projectId, ticket.id, null],
    ['pull_request_merged', 'Search page', projectId, ticket.id, null],
  ]);
  const announced = db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => isEvent(event, 'notification_created'));
  expect(announced.map((event) => event.ticketId)).toEqual([null, null]);
  expect(announced.map((event) => event.payload.kind)).toEqual([
    'awaiting_approval',
    'pull_request_merged',
  ]);
  expect(announced[0]?.payload).toEqual({
    notificationId: rows()[0]?.id ?? -1,
    projectId,
    ticketId: ticket.id,
    investigationId: null,
    kind: 'awaiting_approval',
    title: 'Search page',
    detail: 'Summary waits for your approval.',
  });
});

test('an investigation notifies under its own title and project', () => {
  writeNotifications(db);
  const investigation = db
    .insert(schema.investigations)
    .values({
      projectId,
      title: 'Why is login slow?',
      prompt: 'Look',
      scope: 'global',
      model: 'sonnet',
      tools: [],
    })
    .returning()
    .get();
  emitEvent(db, {
    type: 'investigation_finished',
    investigationId: investigation.id,
    payload: { status: 'succeeded' },
  });
  writeNotifications(db);
  expect(rows().map((row) => [row.kind, row.title, row.investigationId, row.ticketId])).toEqual([
    ['investigation_finished', 'Why is login slow?', investigation.id, null],
  ]);
});

test('events of a removed ticket are skipped, and notifications go with their ticket', () => {
  writeNotifications(db);
  waitForApproval(ticket.id);
  writeNotifications(db);
  waitForApproval(9999);
  expect(writeNotifications(db)).toBe(0);
  db.delete(schema.tickets).where(eq(schema.tickets.id, ticket.id)).run();
  expect(rows()).toEqual([]);
});
