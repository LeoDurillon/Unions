// The tables of the Explain conversations of a review's diff: each conversation, and its turns.

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AgentReviewSpec } from '../review/agent-review-specs';
import { now } from './schema';
import { reviewOwnerColumns, runStatusColumn } from './schema-review-runs';

/** A part of a spec the agent says the lines implement, quoted from the spec named `source`. */
export type ExplainedSpec = { source: string; quote: string; how: string };

/** A document of the repository the lines relate to. */
export type ExplainedDoc = { path: string; heading: string; why: string };

/** What the agent made of the subjects, once the host dropped the citations it could not find. */
export type ExplanationResult = {
  /** Markdown, with `path:line` citations. */
  explanation: string;
  specs: ExplainedSpec[];
  docs: ExplainedDoc[];
  /** Why nothing in the specs asks for the subjects; null when something does. */
  notInSpec: string | null;
  /** The citations dropped: a spec not sent, a quote not in it, a path not in the checkout. */
  dropped: number;
};

/** Lines of a file of the diff (a selection or a hunk), with their text as the diff showed it. */
export type ExplainLines = {
  kind: 'lines';
  path: string;
  side: 'old' | 'new';
  start: number;
  end: number;
  excerpt: string;
};

/** What a turn asks about: lines of the diff, a whole file of it, or the whole change. */
export type ExplainSubject = ExplainLines | { kind: 'file'; path: string } | { kind: 'change' };

/** An Explain conversation on a review (a ticket's branch or a pull request under review). */
export const reviewExplainConversations = sqliteTable(
  'review_explain_conversations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...reviewOwnerColumns,
    title: text('title').notNull(),
    createdAt: integer('created_at').notNull().default(now),
    /** The last turn asked, or the last rename. */
    updatedAt: integer('updated_at').notNull().default(now),
  },
  (t) => [
    index('review_explain_conversations_ticket_idx').on(t.ticketId),
    index('review_explain_conversations_review_idx').on(t.reviewId),
  ],
);

/**
 * One turn of an Explain conversation: a question and the subjects it is about, and the agent's
 * answer. It keeps its review as its owner too, for the run slots, the usage and the cleanups.
 */
export const reviewExplanations = sqliteTable(
  'review_explanations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ...reviewOwnerColumns,
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => reviewExplainConversations.id, { onDelete: 'cascade' }),
    subjects: text('subjects', { mode: 'json' }).$type<ExplainSubject[]>().notNull(),
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
    index('review_explanations_conversation_idx').on(t.conversationId, t.id),
  ],
);
