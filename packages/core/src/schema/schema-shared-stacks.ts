// The services a project's previews share (`union-p<id>-shared`), as the worker last saw them in
// Docker: for the Environments tab, since the web never asks Docker.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now, projects } from './schema';

export const SHARED_STACK_STATUSES = ['running', 'stopped', 'failed'] as const;

/** One shared service: whether its container runs. */
export type SharedStackService = { service: string; running: boolean };

/**
 * A project's shared services: their state, the previews on their networks (`t33`, `r5`), the
 * tickets whose agent uses them, and why the last start failed.
 */
export const sharedStacks = sqliteTable('shared_stacks', {
  projectId: integer('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  status: text('status', { enum: SHARED_STACK_STATUSES }).notNull(),
  services: text('services', { mode: 'json' }).$type<SharedStackService[]>().notNull(),
  /** The previews that use them, by owner key (`t33` a ticket's, `r5` a pull request's). */
  previews: text('previews', { mode: 'json' }).$type<string[]>().notNull(),
  /** The tickets whose agent services use them. */
  agents: text('agents', { mode: 'json' }).$type<number[]>().notNull(),
  error: text('error'),
  /** When they started, while they run. */
  startedAt: integer('started_at'),
  updatedAt: integer('updated_at').notNull().default(now),
});
