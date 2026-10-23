// The agent's grouping of a review's changed files by the parts of a specification, run when the
// user asks: for a ticket's branch or a pull request under review (`review_comments` owners).
import { index, integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import { now, tickets } from './schema';
import { currentReviews } from './schema-reviews';

/** Where the specification came from: the text sent is kept in `spec`, whatever the source. */
export const SPEC_SOURCES = ['pr', 'ticket', 'issue', 'notion'] as const;
export type SpecSource = (typeof SPEC_SOURCES)[number];

/** A part of the specification and the changed files that implement it. */
export type SpecGroup = {
  key: string;
  title: string;
  /** The part of the specification it covers, quoted. */
  spec: string;
  /** What the files do for it. */
  summary: string;
  /** Every file with a change for this part. */
  files: string[];
  /**
   * The files only some of whose hunks serve this part, with those hunks' keys (`hunkKey`); a file
   * not listed here serves it whole. Absent in groupings made before hunks were placed.
   */
  hunks?: Record<string, string[]>;
};

/** A file, or (with `hunks`) some of its hunks, that no part of the specification asked for. */
export type UnrelatedChange = { path: string; reason: string; hunks?: string[] };

/** What the agent made of the change: its groups, the changes no group covers, the parts no change implements. */
export type GroupingResult = {
  groups: SpecGroup[];
  unrelated: UnrelatedChange[];
  missing: { spec: string; note: string }[];
};

/**
 * The agent's grouping of a review's changed files by the parts of a specification, run when the
 * user asks: for a ticket's branch or a pull request under review (`review_comments` owners). The
 * newest row is the one shown; `headSha` is the commit it read, to say when the change moved since.
 */
export const reviewGroupings = sqliteTable(
  'review_groupings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    reviewId: integer('review_id').references((): AnySQLiteColumn => currentReviews.id, {
      onDelete: 'cascade',
    }),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] })
      .notNull()
      .default('queued'),
    sourceKind: text('source_kind', { enum: SPEC_SOURCES }).notNull(),
    /** What the source was, for the panel: "PR description", "Issue #12", the Notion page's title. */
    sourceLabel: text('source_label').notNull(),
    spec: text('spec').notNull(),
    headSha: text('head_sha'),
    result: text('result', { mode: 'json' }).$type<GroupingResult>(),
    error: text('error'),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    index('review_groupings_ticket_idx').on(t.ticketId),
    index('review_groupings_review_idx').on(t.reviewId),
  ],
);
