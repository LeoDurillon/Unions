import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';

export const CONTAINER_RUN_STATUSES = [
  'queued',
  'running',
  /** Exited 0. */
  'succeeded',
  /** Exited non-zero, timed out, or could not run (`error`). */
  'failed',
  'cancelled',
] as const;

/**
 * A command the user ran in a ticket's workspace (its container, in the checkout, as the agent),
 * with the end of its output. The worker runs it; the web only queues it.
 */
export const containerRuns = sqliteTable(
  'container_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    command: text('command').notNull(),
    status: text('status', { enum: CONTAINER_RUN_STATUSES }).notNull().default('queued'),
    exitCode: integer('exit_code'),
    /** Why it did not run to its end: a timeout, the worker stopping, a container that would not start. */
    error: text('error'),
    /** Stdout and stderr together, colours stripped: the last lines only, rewritten while it runs. */
    output: text('output').notNull().default(''),
    timeoutSec: integer('timeout_sec').notNull(),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [index('container_runs_ticket_idx').on(t.ticketId, t.id)],
);
