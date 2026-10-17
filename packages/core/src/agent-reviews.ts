import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';

import type { AgentReviewSpec } from './agent-review-specs';
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

/** A stack's other pull requests under review: each gets its own drafts, on its own head. */
export type MemberDrafts = { reviewId: number; headSha: string; drafts: AgentDraft[] };

export type AgentReviewOutcome =
  | { status: 'succeeded'; headSha: string; drafts: AgentDraft[]; others?: MemberDrafts[] }
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

/** A review's runs: its own, and those of the stacks it is a member of. */
function owns(owner: AgentReviewOwner): SQL {
  if (owner.kind === 'ticket') {
    return eq(schema.agentReviews.ticketId, owner.id);
  }
  const members = schema.agentReviewMembers;
  return sql`(${schema.agentReviews.reviewId} = ${owner.id} or ${schema.agentReviews.id} in (select ${members.agentReviewId} from ${members} where ${members.reviewId} = ${owner.id}))`;
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

/**
 * Queues a review; refused while one is queued or running for the same owner. `specs`: what the
 * agent checks the change against; null keeps the review without them. `members`: the reviews of a
 * stack, bottom first (`owner` is the bottom one); each must be free.
 */
export function queueAgentReview(
  db: Db,
  owner: AgentReviewOwner,
  specs: AgentReviewSpec[] | null = null,
  members: number[] = [],
): AgentReview {
  return db.transaction((tx) => {
    const owners: AgentReviewOwner[] =
      members.length > 1 ? members.map((id) => ({ kind: 'review', id })) : [owner];
    for (const each of owners) {
      const active = tx
        .select()
        .from(schema.agentReviews)
        .where(and(owns(each), inArray(schema.agentReviews.status, ACTIVE)))
        .get();
      if (active) {
        throw new AgentReviewBusyError('The agent is already reviewing this change');
      }
    }
    const review = tx
      .insert(schema.agentReviews)
      .values({
        ...(owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id }),
        specs,
      })
      .returning()
      .get();
    if (members.length > 1) {
      tx.insert(schema.agentReviewMembers)
        .values(
          members.map((reviewId, position) => ({ agentReviewId: review.id, reviewId, position })),
        )
        .run();
    }
    changed(tx, review);
    return review;
  });
}

/** The reviews a stack run covers, bottom first; empty for a run on one change. */
export function agentReviewStack(
  db: Db,
  agentReviewId: number,
): { reviewId: number; prNumber: number }[] {
  return db
    .select({ reviewId: schema.currentReviews.id, prNumber: schema.currentReviews.prNumber })
    .from(schema.agentReviewMembers)
    .innerJoin(
      schema.currentReviews,
      eq(schema.currentReviews.id, schema.agentReviewMembers.reviewId),
    )
    .where(eq(schema.agentReviewMembers.agentReviewId, agentReviewId))
    .orderBy(asc(schema.agentReviewMembers.position))
    .all();
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

/** The agent's drafts the user did not keep or edit (`author` still `agent`) give way to new ones. */
function replaceDrafts(
  tx: Executor,
  owner: AgentReviewOwner,
  headSha: string,
  drafts: AgentDraft[],
): void {
  tx.delete(schema.reviewComments)
    .where(
      and(
        ownsComment(owner),
        eq(schema.reviewComments.author, 'agent'),
        eq(schema.reviewComments.status, 'draft'),
      ),
    )
    .run();
  for (const draft of drafts) {
    tx.insert(schema.reviewComments)
      .values({
        ...draft,
        ...(owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id }),
        headSha,
        author: 'agent',
      })
      .run();
  }
}

/**
 * Records the end of a run. A success replaces the agent's earlier drafts the user did not keep or
 * edit with the new ones, on every review it covers; the user's own drafts are never touched.
 */
export function finishAgentReview(db: Db, id: number, outcome: AgentReviewOutcome): void {
  db.transaction((tx) => {
    const others = outcome.status === 'succeeded' ? (outcome.others ?? []) : [];
    const review = tx
      .update(schema.agentReviews)
      .set({
        status: outcome.status,
        error: outcome.status === 'failed' ? outcome.error : null,
        comments:
          outcome.status === 'succeeded'
            ? others.reduce((sum, other) => sum + other.drafts.length, outcome.drafts.length)
            : null,
        finishedAt: Date.now(),
      })
      .where(eq(schema.agentReviews.id, id))
      .returning()
      .get();
    if (outcome.status === 'succeeded') {
      replaceDrafts(tx, ownerOf(review), outcome.headSha, outcome.drafts);
      for (const other of others) {
        replaceDrafts(tx, { kind: 'review', id: other.reviewId }, other.headSha, other.drafts);
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
