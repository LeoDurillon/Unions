// What needs the user, drawn from the event log by the worker: one row per event that notifies, read in the bell's panel.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { investigations, now, projects, tickets } from './schema';

/** The moments that notify, one per kind of event (see `notificationFor`). */
export const NOTIFICATION_KINDS = [
  'awaiting_approval',
  'failed',
  'commit_refused',
  'rate_limited',
  'start_blocked',
  'pull_request_merged',
  'pull_request_closed',
  'investigation_finished',
  'investigation_failed',
  'rule_failed',
] as const;

/**
 * One moment that needs the user, from the event `eventSeq` (unique: an event notifies once).
 * `title` names what it is about (the ticket or the investigation), `detail` says what happened.
 */
export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    investigationId: integer('investigation_id').references(() => investigations.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind', { enum: NOTIFICATION_KINDS }).notNull(),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    eventSeq: integer('event_seq').notNull(),
    createdAt: integer('created_at').notNull().default(now),
    /** Null while unread. */
    readAt: integer('read_at'),
  },
  (t) => [
    uniqueIndex('notifications_event_idx').on(t.eventSeq),
    index('notifications_unread_idx').on(t.readAt, t.id),
  ],
);
