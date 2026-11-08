// What each agent call consumed, per model: written from its `result` line in `agent_log`.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { now } from './schema';

/**
 * One `claude -p` call's tokens for one model (the call's own, or its subagents'). The owner is the
 * one of its `result` line, `result_line_id`; like `agent_log`, rows stay when a ticket is removed.
 * The session's figures are cumulative in the result: these are the call's share.
 */
export const agentUsage = sqliteTable(
  'agent_usage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    resultLineId: integer('result_line_id').notNull(),
    ticketId: integer('ticket_id'),
    runId: integer('run_id'),
    investigationId: integer('investigation_id'),
    sessionId: text('session_id').notNull(),
    model: text('model').notNull(),
    /** The model of the call's own turns; the others are its subagents'. */
    main: integer('main', { mode: 'boolean' }).notNull(),
    input: integer('input').notNull(),
    cacheRead: integer('cache_read').notNull(),
    cacheWrite: integer('cache_write').notNull(),
    output: integer('output').notNull(),
    /** Part of `output`. */
    thinking: integer('thinking').notNull(),
    webSearches: integer('web_searches').notNull(),
    costMicroUsd: integer('cost_micro_usd'), // API-equivalent, not billed on Max
    // The call's own figures, on the main model's row only.
    turns: integer('turns'),
    durationMs: integer('duration_ms'),
    apiDurationMs: integer('api_duration_ms'),
    /** The largest context of one of its turns: input, cache reads and writes. */
    peakContext: integer('peak_context'),
    contextWindow: integer('context_window'),
    failed: integer('failed', { mode: 'boolean' }).notNull().default(false),
    at: integer('at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('agent_usage_result_idx').on(t.resultLineId, t.model),
    index('agent_usage_ticket_idx').on(t.ticketId),
    index('agent_usage_run_idx').on(t.runId),
    index('agent_usage_investigation_idx').on(t.investigationId),
  ],
);
