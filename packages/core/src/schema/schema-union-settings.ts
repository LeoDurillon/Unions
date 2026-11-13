// The one-row table of Union's machine settings: container limits, how much runs at once, and the images it runs.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { DEFAULT_COUNTS } from '../union/union-settings-fields';
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
  /** Agent runs at the same time: tickets, investigations, agent reviews and rewrites. */
  maxConcurrentRuns: integer('max_concurrent_runs')
    .notNull()
    .default(DEFAULT_COUNTS.maxConcurrentRuns),
  /** Previews running at the same time, across projects. */
  maxPreviews: integer('max_previews').notNull().default(DEFAULT_COUNTS.maxPreviews),
  /** How often the changes made on GitHub are read, in seconds. */
  githubPullSeconds: integer('github_pull_seconds')
    .notNull()
    .default(DEFAULT_COUNTS.githubPullSeconds),
  /** The largest file a project can be given, in MB. */
  maxProjectFileMb: integer('max_project_file_mb')
    .notNull()
    .default(DEFAULT_COUNTS.maxProjectFileMb),
  /** The image agents run in (`FROM union-agent`); null: `union-agent:local`. */
  agentImage: text('agent_image'),
  /** The minimal image (`FROM union-agent-base`); null: `union-agent-base:local`. */
  agentBaseImage: text('agent_base_image'),
  /** The Docker CLI image previews' compose runs in; null: the one Union pins. */
  composeImage: text('compose_image'),
  updatedAt: integer('updated_at').notNull().default(now),
});
