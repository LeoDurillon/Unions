import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';

export const PR_DESCRIPTION_STATUSES = [
  'queued',
  'running',
  /** Written: the user edits, sends or discards it. */
  'ready',
  'sending',
  'sent',
  /** The description changed on GitHub after the draft was written: not sent. */
  'conflict',
  'failed',
  'cancelled',
  'discarded',
] as const;

/**
 * A pull request description the agent rewrote for a ticket whose work changed after the PR was
 * opened. Nothing reaches GitHub until the user sends the draft, and only if the description on
 * GitHub is still the one the agent started from (`original`).
 */
export const prDescriptions = sqliteTable(
  'pr_descriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    prNumber: integer('pr_number').notNull(),
    status: text('status', { enum: PR_DESCRIPTION_STATUSES }).notNull().default('queued'),
    /** The description on GitHub when the agent started, as GitHub had it (Union's links included). */
    original: text('original'),
    /** The agent's description, then the user's edit of it; without Union's links. */
    text: text('text'),
    error: text('error'),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    sentAt: integer('sent_at'),
  },
  (t) => [index('pr_descriptions_ticket_idx').on(t.ticketId, t.id)],
);
