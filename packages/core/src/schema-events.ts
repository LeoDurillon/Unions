// Event rule tables: the rules, their deliveries, and the event log's readers.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { EventAction } from './event-actions';
import type { EventTrigger } from './event-rule-types';
import { now, projects, tickets } from './schema';

/** When something happens to one of the project's tickets, do something elsewhere. */
export const eventRules = sqliteTable(
  'event_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    trigger: text('trigger', { mode: 'json' }).$type<EventTrigger>().notNull(),
    action: text('action', { mode: 'json' }).$type<EventAction>().notNull(),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [index('event_rules_project_idx').on(t.projectId)],
);

/**
 * One rule applied to one event: pending until the worker does it, then what it did. The unique
 * key keeps an event from being applied twice by the same rule.
 */
export const eventDeliveries = sqliteTable(
  'event_deliveries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ruleId: integer('rule_id')
      .notNull()
      .references(() => eventRules.id, { onDelete: 'cascade' }),
    eventSeq: integer('event_seq').notNull(),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'succeeded', 'failed', 'skipped'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    /** What was set, or why it was skipped. */
    detail: text('detail'),
    error: text('error'),
    nextAttemptAt: integer('next_attempt_at').notNull().default(now),
    createdAt: integer('created_at').notNull().default(now),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    uniqueIndex('event_deliveries_rule_event_idx').on(t.ruleId, t.eventSeq),
    index('event_deliveries_pending_idx').on(t.status, t.nextAttemptAt),
  ],
);

/** How far a reader of the event log got (`seq` of the last event it handled). */
export const eventCursors = sqliteTable('event_cursors', {
  name: text('name').primaryKey(),
  seq: integer('seq').notNull(),
});
