// A project's own agent image: the one its agents run on, the one saved and not applied yet, and its build's state and log.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AgentImageSource, AppliedAgentImage } from './agent-image-source';
import { now, projects } from './schema';

export const AGENT_IMAGE_STATUSES = [
  /** Nothing waits to be applied. */
  'idle',
  /** Saved; the worker has not started on it. */
  'queued',
  'building',
  /** The saved one did not build or failed the check: `applied` is still in use. */
  'failed',
] as const;

/**
 * A project's own agent image, one row per project once it has been set. The web writes `pending`
 * (and the status, to `queued`); the worker builds and checks it, then moves it to `applied`. Every
 * write of the worker names the `savedAt` it started from, so a newer save is never overwritten.
 */
export const agentImages = sqliteTable('agent_images', {
  projectId: integer('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  /** What the project's agents run on; null: the base image. */
  applied: text('applied', { mode: 'json' }).$type<AppliedAgentImage>(),
  /** Saved and not applied yet: queued, building, or failed. */
  pending: text('pending', { mode: 'json' }).$type<AgentImageSource>(),
  status: text('status', { enum: AGENT_IMAGE_STATUSES }).notNull().default('idle'),
  /** Why the saved one was not applied. */
  error: text('error'),
  /** The build's or pull's output, colours stripped: the last lines only, rewritten while it runs. */
  output: text('output').notNull().default(''),
  savedAt: integer('saved_at').notNull().default(now),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
});
