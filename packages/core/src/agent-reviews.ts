import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';
import { emitEvent } from './tickets';

export type AgentReview = typeof schema.agentReviews.$inferSelect;

/** Whose review the agent comments on: a ticket's, or a current review of a pull request. */
export type AgentReviewOwner = { kind: 'ticket'; id: number } | { kind: 'review'; id: number };

/** A finding turned into a draft comment; `general` ones carry empty lines and excerpt. */
export type AgentDraft = Pick<
  typeof schema.reviewComments.$inferInsert,
  'kind' | 'path' | 'side' | 'startLine' | 'endLine' | 'excerpt' | 'body'
>;

export type AgentReviewOutcome =
  | { status: 'succeeded'; headSha: string; drafts: AgentDraft[] }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

const ACTIVE = ['queued', 'running'] as const;

/** An agent review is already queued or running for this owner. */
export class AgentReviewBusyError extends Error {}

function ownerOf(review: AgentReview): AgentReviewOwner {
  return review.ticketId === null
    ? { kind: 'review', id: review.reviewId ?? 0 }
    : { kind: 'ticket', id: review.ticketId };
}

function owns(owner: AgentReviewOwner): SQL {
  return owner.kind === 'ticket'
    ? eq(schema.agentReviews.ticketId, owner.id)
    : eq(schema.agentReviews.reviewId, owner.id);
}

function ownsComment(owner: AgentReviewOwner): SQL {
  return owner.kind === 'ticket'
    ? eq(schema.reviewComments.ticketId, owner.id)
    : eq(schema.reviewComments.reviewId, owner.id);
}

type Executor = Parameters<typeof emitEvent>[0];

/** Every change is an event: the ticket's live view, or the review page, refreshes on it. */
function changed(db: Executor, review: AgentReview): void {
  emitEvent(db, {
    type: 'agent_review_changed',
    ticketId: review.ticketId ?? undefined,
    payload: {
      agentReviewId: review.id,
      reviewId: review.reviewId,
      status: review.status,
      comments: review.comments,
      error: review.error,
    },
  });
}

/** The owner's latest agent review, whatever its status. */
export function latestAgentReview(db: Db, owner: AgentReviewOwner): AgentReview | null {
  return (
    db
      .select()
      .from(schema.agentReviews)
      .where(owns(owner))
      .orderBy(desc(schema.agentReviews.id))
      .get() ?? null
  );
}

/** Queues a review; refused while one is queued or running for the same owner. */
export function queueAgentReview(db: Db, owner: AgentReviewOwner): AgentReview {
  return db.transaction((tx) => {
    const active = tx
      .select()
      .from(schema.agentReviews)
      .where(and(owns(owner), inArray(schema.agentReviews.status, ACTIVE)))
      .get();
    if (active) {
      throw new AgentReviewBusyError('The agent is already reviewing this change');
    }
    const review = tx
      .insert(schema.agentReviews)
      .values(owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id })
      .returning()
      .get();
    changed(tx, review);
    return review;
  });
}

/** The oldest queued review, now running; null when none waits. */
export function claimAgentReview(db: Db): AgentReview | null {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(schema.agentReviews)
      .where(eq(schema.agentReviews.status, 'queued'))
      .orderBy(asc(schema.agentReviews.id))
      .get();
    if (!next) {
      return null;
    }
    const review = tx
      .update(schema.agentReviews)
      .set({ status: 'running', startedAt: Date.now() })
      .where(eq(schema.agentReviews.id, next.id))
      .returning()
      .get();
    changed(tx, review);
    return review;
  });
}

/**
 * Records the end of a run. A success replaces the agent's earlier drafts the user did not keep or
 * edit (`author` still `agent`) with the new ones; the user's own drafts are never touched.
 */
export function finishAgentReview(db: Db, id: number, outcome: AgentReviewOutcome): void {
  db.transaction((tx) => {
    const review = tx
      .update(schema.agentReviews)
      .set({
        status: outcome.status,
        error: outcome.status === 'failed' ? outcome.error : null,
        comments: outcome.status === 'succeeded' ? outcome.drafts.length : null,
        finishedAt: Date.now(),
      })
      .where(eq(schema.agentReviews.id, id))
      .returning()
      .get();
    if (outcome.status === 'succeeded') {
      const owner = ownerOf(review);
      tx.delete(schema.reviewComments)
        .where(
          and(
            ownsComment(owner),
            eq(schema.reviewComments.author, 'agent'),
            eq(schema.reviewComments.status, 'draft'),
          ),
        )
        .run();
      for (const draft of outcome.drafts) {
        tx.insert(schema.reviewComments)
          .values({
            ...draft,
            ...(owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id }),
            headSha: outcome.headSha,
            author: 'agent',
          })
          .run();
      }
    }
    changed(tx, review);
  });
}

/** Cancels a review still waiting for a slot; false when it already started (the runner stops it). */
export function cancelQueuedAgentReview(db: Db, id: number): boolean {
  const [review] = db
    .update(schema.agentReviews)
    .set({ status: 'cancelled', finishedAt: Date.now() })
    .where(and(eq(schema.agentReviews.id, id), eq(schema.agentReviews.status, 'queued')))
    .returning()
    .all();
  if (!review) {
    return false;
  }
  changed(db, review);
  return true;
}

/** Fails the reviews a stopped worker left running, and returns them. */
export function failInterruptedAgentReviews(db: Db): AgentReview[] {
  const running = db
    .select()
    .from(schema.agentReviews)
    .where(eq(schema.agentReviews.status, 'running'))
    .all();
  for (const review of running) {
    finishAgentReview(db, review.id, {
      status: 'failed',
      error: 'The worker stopped during the review',
    });
  }
  return running;
}
