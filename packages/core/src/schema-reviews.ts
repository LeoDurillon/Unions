import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

import { currentReviews, now, tickets } from './schema';

/** Comments on a ticket's review or a current review of a pull request (one of them), drafts until sent. */
export const reviewComments = sqliteTable(
  'review_comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    reviewId: integer('review_id').references((): AnySQLiteColumn => currentReviews.id, {
      onDelete: 'cascade',
    }),
    /**
     * `line`: on lines of a file. `general`: about the whole pull request (a review summary or a
     * conversation comment imported from GitHub); its path, side, lines and excerpt are empty.
     */
    kind: text('kind', { enum: ['line', 'general'] })
      .notNull()
      .default('line'),
    path: text('path').notNull(),
    side: text('side', { enum: ['old', 'new'] }).notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    /** The commented lines as they were, so the comment still reads right once the diff changes. */
    excerpt: text('excerpt').notNull(),
    body: text('body').notNull(),
    headSha: text('head_sha').notNull(),
    status: text('status', { enum: ['draft', 'sent'] })
      .notNull()
      .default('draft'),
    author: text('author', { enum: ['user', 'agent'] }) // agent: a suggestion not kept or edited yet
      .notNull()
      .default('user'),
    sentAt: integer('sent_at'),
    /** Set when imported from the pull request (a thread's first comment, a review, a comment): a re-import skips it. */
    githubUrl: text('github_url'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [
    index('review_comments_ticket_idx').on(t.ticketId, t.status),
    index('review_comments_review_idx').on(t.reviewId, t.status),
    uniqueIndex('review_comments_github_idx').on(t.ticketId, t.githubUrl),
  ],
);

/**
 * A review agent asked to comment on a ticket's diff or on a current review's pull request (one of
 * them). Its findings become draft comments the user keeps, edits or deletes before sending.
 */
export const agentReviews = sqliteTable(
  'agent_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    reviewId: integer('review_id').references((): AnySQLiteColumn => currentReviews.id, {
      onDelete: 'cascade',
    }),
    status: text('status', {
      enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
    })
      .notNull()
      .default('queued'),
    error: text('error'),
    /** Drafts the run added (a run replaces the agent's drafts the user did not keep). */
    comments: integer('comments'),
    createdAt: integer('created_at').notNull().default(now),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    index('agent_reviews_ticket_idx').on(t.ticketId),
    index('agent_reviews_review_idx').on(t.reviewId),
  ],
);
