// The claude.ai connectors of the Claude account the agents run with, as the last check read them
// (`claude mcp list` in a throwaway container).
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now } from './schema';

/**
 * The claude.ai connectors of the Claude account the agents run with, as the last check read them
 * (`claude mcp list` in a throwaway container). Their tokens stay with Anthropic: an agent reaches
 * one through the Claude login, when its tools include the connector (`mcp__claude_ai_<Name>`).
 */
export const mcpConnectors = sqliteTable('mcp_connectors', {
  /** As claude.ai names it: `Figma`. */
  name: text('name').primaryKey(),
  url: text('url').notNull(),
  /** As `claude mcp list` says it: `✔ Connected`, `! Needs authentication`… */
  status: text('status').notNull(),
  connected: integer('connected', { mode: 'boolean' }).notNull(),
  checkedAt: integer('checked_at').notNull().default(now),
});

/** A reading of the connectors the user asked for; the worker runs the queued one. */
export const mcpConnectorChecks = sqliteTable('mcp_connector_checks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed'] })
    .notNull()
    .default('queued'),
  error: text('error'),
  createdAt: integer('created_at').notNull().default(now),
  finishedAt: integer('finished_at'),
});
