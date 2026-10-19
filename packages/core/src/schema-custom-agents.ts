// The user's own agents: a name and a role, and the prompt the worker's prompt writer wrote from them.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now } from './schema';

export const CUSTOM_AGENT_PROMPT_STATUSES = [
  /** Waiting for the worker's prompt writer, first or after Regenerate. */
  'queued',
  'running',
  'ready',
  'failed',
] as const;

/**
 * A custom agent: its step is `agent_<id>` (`customStep`). The user's edits (prompt, model, effort,
 * tools) live in `agent_configs` under that key, like a built-in agent's. Deleting is soft: finished
 * tickets keep its tab and runs under its name.
 */
export const customAgents = sqliteTable('custom_agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** What the user wants it to do, in their words: the prompt writer's input. */
  role: text('role').notNull(),
  /** Null until the prompt writer first succeeds; a later run replaces it. */
  defaultPrompt: text('default_prompt'),
  promptStatus: text('prompt_status', { enum: CUSTOM_AGENT_PROMPT_STATUSES })
    .notNull()
    .default('queued'),
  promptError: text('prompt_error'),
  deletedAt: integer('deleted_at'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at')
    .notNull()
    .default(now)
    .$onUpdate(() => Date.now()),
});
