import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';
import { currentReviews } from './schema-reviews';

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
 * A command the user ran in a workspace: a ticket's (its container, in the checkout, as the agent)
 * or a pull request's under review (exactly one of `ticket_id` and `review_id`), with the end of
 * its output. The worker runs it; the web only queues it.
 */
export const containerRuns = sqliteTable(
  'container_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    reviewId: integer('review_id').references((): AnySQLiteColumn => currentReviews.id, {
      onDelete: 'cascade',
    }),
    command: text('command').notNull(),
    /** The saved script it ran, by name (its command as it was then is `command`). */
    scriptName: text('script_name'),
    status: text('status', { enum: CONTAINER_RUN_STATUSES }).notNull().default('queued'),
    exitCode: integer('exit_code'),
    /** Why it did not run to its end: a timeout, the worker stopping, a container that would not start. */
    error: text('error'),
    /** Stdout and stderr together, colours stripped: the last lines only, rewritten while it runs. */
    output: text('output').notNull().default(''),
    timeoutSec: integer('timeout_sec').notNull(),
    /**
     * For the implementer: `next_run` while its next run should read the output, `sent` once it
     * did; null when the user kept it to themselves, and always for a pull request's.
     */
    forAgent: text('for_agent', { enum: ['next_run', 'sent'] }),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    index('container_runs_ticket_idx').on(t.ticketId, t.id),
    index('container_runs_review_idx').on(t.reviewId, t.id),
    check('container_runs_one_owner', sql`(${t.ticketId} IS NULL) <> (${t.reviewId} IS NULL)`),
  ],
);
