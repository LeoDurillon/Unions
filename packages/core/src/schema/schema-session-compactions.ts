// A compaction of a ticket's implementer session the user asked for: `/compact` run in it, between steps.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';

export const SESSION_COMPACTION_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;

/**
 * A compaction of a ticket's implementer session, asked from its panel: the worker resumes the
 * session in the ticket's container with `/compact`, so the next step resumes the summary instead of
 * the whole conversation. The session keeps its id.
 */
export const sessionCompactions = sqliteTable(
  'session_compactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    /** The session's context at its last call before the compaction, in tokens; null: unknown. */
    contextBefore: integer('context_before'),
    status: text('status', { enum: SESSION_COMPACTION_STATUSES }).notNull().default('queued'),
    error: text('error'),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [index('session_compactions_ticket_idx').on(t.ticketId, t.id)],
);
