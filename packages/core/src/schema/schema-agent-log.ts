// The agents' raw output, line by line, kept apart from the event log.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now } from './schema';

/**
 * One `claude -p` stream-json event (or a `union_*` note) of a ticket's, an investigation's or an explanation's agent.
 * `after_seq` is the last `events.seq` when it was written: the Log shows each line after that
 * event and before the next, so run headers and their lines keep their order across both tables.
 */
export const agentLog = sqliteTable(
  'agent_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    afterSeq: integer('after_seq').notNull(),
    ticketId: integer('ticket_id'),
    runId: integer('run_id'),
    investigationId: integer('investigation_id'),
    explanationId: integer('explanation_id'),
    payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
    at: integer('at').notNull().default(now),
  },
  (t) => [
    index('agent_log_ticket_idx').on(t.ticketId, t.id),
    index('agent_log_investigation_idx').on(t.investigationId, t.id),
    index('agent_log_explanation_idx').on(t.explanationId, t.id),
  ],
);
