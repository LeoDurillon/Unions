// The agent's report comparing a review's change with its specs, run when the user asks: for a
// ticket's branch or a pull request under review (`review_comments` owners).
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ReportSpec, ReviewReportResult } from './review-report-types';
import { now } from './schema';
import { reviewOwnerColumns, runStatusColumn } from './schema-review-runs';

/**
 * The agent's report on how a review's change meets its specs, run when the user asks: for a
 * ticket's branch or a pull request under review (`review_comments` owners). The newest row is the
 * one shown; `headSha` is the commit it read, to say when the change moved since.
 */
export const reviewReports = sqliteTable(
  'review_reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...reviewOwnerColumns,
    status: runStatusColumn,
    /** The specs as sent, numbered as the agent cites them. */
    specs: text('specs', { mode: 'json' }).$type<ReportSpec[]>().notNull(),
    headSha: text('head_sha'),
    result: text('result', { mode: 'json' }).$type<ReviewReportResult>(),
    /** The agent's text when its block could not be read, so the user can still read it. */
    raw: text('raw'),
    error: text('error'),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    index('review_reports_ticket_idx').on(t.ticketId),
    index('review_reports_review_idx').on(t.reviewId),
  ],
);
