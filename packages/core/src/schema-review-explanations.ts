// The table of the explanations an agent gives of lines of a review's diff, and what one holds.
import { index, integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import type { AgentReviewSpec } from './agent-review-specs';
import { now } from './schema';
import { reviewOwnerColumns, runStatusColumn } from './schema-review-runs';

/** A part of a spec the agent says the lines implement, quoted from the spec named `source`. */
export type ExplainedSpec = { source: string; quote: string; how: string };

/** A document of the repository the lines relate to. */
export type ExplainedDoc = { path: string; heading: string; why: string };

/** What the agent made of the lines, once the host dropped the citations it could not find. */
export type ExplanationResult = {
  /** Markdown, with `path:line` citations. */
  explanation: string;
  specs: ExplainedSpec[];
  docs: ExplainedDoc[];
  /** Why nothing in the specs asks for the lines; null when something does. */
  notInSpec: string | null;
  /** The citations dropped: a spec not sent, a quote not in it, a path not in the checkout. */
  dropped: number;
};

/**
 * One Explain of lines of a review (a ticket's branch or a pull request under review, the
 * `review_comments` owners); a follow-up has the explanation it follows as `parentId`.
 */
export const reviewExplanations = sqliteTable(
  'review_explanations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...reviewOwnerColumns,
    parentId: integer('parent_id').references((): AnySQLiteColumn => reviewExplanations.id, {
      onDelete: 'cascade',
    }),
    path: text('path').notNull(),
    side: text('side', { enum: ['old', 'new'] }).notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    /** The selected lines' text, as the diff showed them. */
    excerpt: text('excerpt').notNull(),
    question: text('question'),
    specs: text('specs', { mode: 'json' }).$type<AgentReviewSpec[]>().notNull(),
    /** The commit the review showed when asked: another one later makes it outdated. */
    headSha: text('head_sha').notNull(),
    status: runStatusColumn,
    result: text('result', { mode: 'json' }).$type<ExplanationResult>(),
    sessionId: text('session_id'),
    error: text('error'),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    index('review_explanations_ticket_idx').on(t.ticketId),
    index('review_explanations_review_idx').on(t.reviewId),
  ],
);
