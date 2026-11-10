// The one-row table of Union's machine settings: how much memory and how many CPU cores its containers may use.
import { integer, sqliteTable } from 'drizzle-orm/sqlite-core';

import { now } from './schema';

/**
 * Settings of the machine Union runs on, not of a project. One row (`id` 1); no row: the defaults
 * (`unionSettings`).
 */
export const unionSettings = sqliteTable('union_settings', {
  id: integer('id').primaryKey(),
  /** The memory each agent container may use (tickets, reviews, investigations, checkouts), in MB. */
  agentMemoryMb: integer('agent_memory_mb').notNull(),
  /** The memory each service of a preview may use, in MB. */
  previewServiceMemoryMb: integer('preview_service_memory_mb').notNull(),
  /** The CPU cores each container (agent or preview service) may use. */
  cpus: integer('cpus').notNull(),
  updatedAt: integer('updated_at').notNull().default(now),
});
