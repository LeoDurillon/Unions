import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

import type { AgentReviewSpec } from './agent-review-specs';
import { now, projects, tickets } from './schema';
import type { PullRequestFile } from './schema-types';

/**
 * Pull requests the user put under review from the Pull requests tab, without a ticket. The fields
 * are a snapshot of the pull request when it was added, so the tab lists them without calling GitHub.
 */
export const currentReviews = sqliteTable(
  'current_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    prNumber: integer('pr_number').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    author: text('author').notNull(),
    headBranch: text('head_branch').notNull(),
    baseBranch: text('base_branch').notNull(),
    /** The pull request's files as last fetched for review, and the head commit they are at. */
    files: text('files', { mode: 'json' }).$type<PullRequestFile[]>(),
    headSha: text('head_sha'),
    /** `sending` while the worker posts the review to GitHub; `failed` with `submitError` when it could not. */
    submitStatus: text('submit_status', { enum: ['sending', 'failed'] }),
    submitError: text('submit_error'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('current_reviews_pr_idx').on(t.projectId, t.prNumber)],
);

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
    /** What the agent checks the change against, as the user sent them; null: no specs asked for. */
    specs: text('specs', { mode: 'json' }).$type<AgentReviewSpec[]>(),
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

/**
 * The pull requests under review a stack's agent review covers, bottom first. The run's own
 * `review_id` is the bottom one's; a run on one pull request has no rows here.
 */
export const agentReviewMembers = sqliteTable(
  'agent_review_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentReviewId: integer('agent_review_id')
      .notNull()
      .references(() => agentReviews.id, { onDelete: 'cascade' }),
    reviewId: integer('review_id')
      .notNull()
      .references(() => currentReviews.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (t) => [
    uniqueIndex('agent_review_members_idx').on(t.agentReviewId, t.reviewId),
    index('agent_review_members_review_idx').on(t.reviewId),
  ],
);
