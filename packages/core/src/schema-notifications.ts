// What needs the user, drawn from the event log by the worker: one row per event that notifies, read in the bell's panel.
import { isNotNull, isNull } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { investigations, now, projects, tickets } from './schema';

/** The moments that notify, one per kind of event (see `notificationFor`); `rule`: a rule's "Notify me in Union". */
export const NOTIFICATION_KINDS = [
  'awaiting_approval',
  'failed',
  'commit_refused',
  'rate_limited',
  'start_blocked',
  'pull_request_merged',
  'pull_request_closed',
  'pull_request_checks_failed',
  'ci_rerun_failed',
  'investigation_finished',
  'investigation_failed',
  'rule_failed',
  'rule',
] as const;

/**
 * One moment that needs the user, from the event `eventSeq`: a built-in one notifies once per event,
 * a rule's once per rule and event. `title` names what it is about (the ticket or the
 * investigation), `detail` says what happened (a rule's: its message, filled in).
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
    /** The rule that sent it (kept after the rule is deleted); null for the built-in moments. */
    ruleId: integer('rule_id'),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    eventSeq: integer('event_seq').notNull(),
    createdAt: integer('created_at').notNull().default(now),
    /** Null while unread. */
    readAt: integer('read_at'),
  },
  (t) => [
    uniqueIndex('notifications_event_idx').on(t.eventSeq).where(isNull(t.ruleId)),
    uniqueIndex('notifications_rule_event_idx').on(t.ruleId, t.eventSeq).where(isNotNull(t.ruleId)),
    index('notifications_unread_idx').on(t.readAt, t.id),
  ],
);
