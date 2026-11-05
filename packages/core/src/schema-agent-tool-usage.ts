// What each agent call did with its tools: calls, errors, refusals and output size per tool key, written from its `result` line.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { now } from './schema';

/**
 * One `claude -p` call's uses of one tool key (`agent-tool-key.ts`), its own or its subagents'.
 * Owner and session are the ones of its `result` line, as in `agent_usage`; rows stay when a ticket
 * is removed.
 */
export const agentToolUsage = sqliteTable(
  'agent_tool_usage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    resultLineId: integer('result_line_id').notNull(),
    ticketId: integer('ticket_id'),
    runId: integer('run_id'),
    investigationId: integer('investigation_id'),
    sessionId: text('session_id').notNull(),
    tool: text('tool').notNull(),
    /** The command family, the file read, the skill or the subagent type; empty for the others. */
    target: text('target').notNull(),
    /** The command's shape (Bash only). */
    variant: text('variant').notNull(),
    /** Made by a subagent: its output did not enter the call's own session. */
    subagent: integer('subagent', { mode: 'boolean' }).notNull(),
    calls: integer('calls').notNull(),
    errors: integer('errors').notNull(),
    denied: integer('denied').notNull(),
    /** The text of the results, in characters. */
    resultBytes: integer('result_bytes').notNull(),
    at: integer('at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('agent_tool_usage_key_idx').on(
      t.resultLineId,
      t.tool,
      t.target,
      t.variant,
      t.subagent,
    ),
    index('agent_tool_usage_ticket_idx').on(t.ticketId),
    index('agent_tool_usage_investigation_idx').on(t.investigationId),
  ],
);
