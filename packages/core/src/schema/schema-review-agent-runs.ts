// A review agent's runs on a review's change, asked from its review page: the markdown it answered, or why it failed.

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ReportSpec } from '../review-report-types';
import { now } from './schema';
import { customAgents } from './schema-custom-agents';
import { reviewOwnerColumns, runStatusColumn } from './schema-review-runs';

/**
 * One run of a review agent (a custom agent of the `review` kind) on a ticket's branch or a pull
 * request under review. The newest run per agent and change is the one shown; `headSha` is the
 * commit it read, to say when the change moved since.
 */
export const reviewAgentRuns = sqliteTable(
  'review_agent_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...reviewOwnerColumns,
    /** Deleting an agent is soft: its runs keep pointing at it. */
    agentId: integer('agent_id')
      .notNull()
      .references(() => customAgents.id),
    status: runStatusColumn,
    /** The review's specs as sent, read when the run was asked; empty when it has none. */
    specs: text('specs', { mode: 'json' }).$type<ReportSpec[]>().notNull(),
    headSha: text('head_sha'),
    /** The agent's answer, markdown with `path:line` references; null until it succeeds. */
    output: text('output'),
    error: text('error'),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    index('review_agent_runs_ticket_idx').on(t.ticketId),
    index('review_agent_runs_review_idx').on(t.reviewId),
  ],
);
