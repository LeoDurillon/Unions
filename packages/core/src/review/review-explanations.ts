// The turns of a review's Explain conversations: queued by the web, claimed and finished by the worker.

import { and, asc, desc, eq, gt, lte, type SQL } from 'drizzle-orm';

import type { Db } from '../db';
import type { ExplainSubject, ExplanationResult } from '../schema/schema-review-explanations';
import * as schema from '../tables';
import { emitEvent } from '../ticket/tickets';
import type { AgentReviewSpec } from './agent-review-specs';
import type { AgentReviewOwner } from './agent-reviews';
import {
  conversationChanged,
  ConversationBusyError,
  createConversation,
  ownedConversation,
} from './explain-conversations';
import { conversationTitle } from './explain-subjects';
import {
  cancelQueuedReviewRun,
  claimReviewRun,
  failInterruptedReviewRuns,
  type ReviewRunLife,
} from './review-run-lifecycle';

export type ReviewExplanation = typeof schema.reviewExplanations.$inferSelect;
export type {
  ExplainedDoc,
  ExplainedSpec,
  ExplainLines,
  ExplainSubject,
  ExplanationResult,
} from '../schema/schema-review-explanations';

export type ExplanationOutcome =
  | { status: 'succeeded'; result: ExplanationResult; sessionId: string }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

/** A turn to ask: in a new conversation (`conversationId` null) or an existing one of the review. */
export type ExplanationRequest = {
  conversationId: number | null;
  subjects: ExplainSubject[];
  question: string | null;
  /** The specs sent; null keeps the conversation's last turn's (none for a new one). */
  specs: AgentReviewSpec[] | null;
  /** The commit the review shows. */
  headSha: string;
};

const ACTIVE = new Set<string>(['queued', 'running']);

/** Thrown when the conversation asked into is not the review's. */
export class UnknownConversationError extends Error {}

type Executor = Parameters<typeof emitEvent>[0];

function owns(owner: AgentReviewOwner): SQL {
  return owner.kind === 'ticket'
    ? eq(schema.reviewExplanations.ticketId, owner.id)
    : eq(schema.reviewExplanations.reviewId, owner.id);
}

export function explanationOwner(explanation: ReviewExplanation): AgentReviewOwner {
  return explanation.ticketId === null
    ? { kind: 'review', id: explanation.reviewId ?? 0 }
    : { kind: 'ticket', id: explanation.ticketId };
}

/** Every change is an event, as for the groupings: the page polls while one is active. */
function changed(db: Executor, explanation: ReviewExplanation): void {
  emitEvent(db, {
    type: 'review_explanation_changed',
    ticketId: explanation.ticketId ?? undefined,
    payload: {
      explanationId: explanation.id,
      reviewId: explanation.reviewId,
      status: explanation.status,
      error: explanation.error,
    },
  });
}

/** The owner's turns, newest first. */
export function explanationsOf(db: Db, owner: AgentReviewOwner): ReviewExplanation[] {
  return db
    .select()
    .from(schema.reviewExplanations)
    .where(owns(owner))
    .orderBy(desc(schema.reviewExplanations.id))
    .all();
}

export function getExplanation(db: Db, id: number): ReviewExplanation | null {
  return (
    db.select().from(schema.reviewExplanations).where(eq(schema.reviewExplanations.id, id)).get() ??
    null
  );
}

/** The turns of the explanation's conversation up to it, first question first. */
export function explanationThread(db: Db, explanation: ReviewExplanation): ReviewExplanation[] {
  const table = schema.reviewExplanations;
  return db
    .select()
    .from(table)
    .where(and(eq(table.conversationId, explanation.conversationId), lte(table.id, explanation.id)))
    .orderBy(asc(table.id))
    .all();
}

function lastTurn(db: Executor, conversationId: number): ReviewExplanation | undefined {
  const table = schema.reviewExplanations;
  return db
    .select()
    .from(table)
    .where(eq(table.conversationId, conversationId))
    .orderBy(desc(table.id))
    .get();
}

/**
 * Queues a turn, in a new conversation or after the last turn of one; refused while that one's last
 * turn waits for its answer.
 */
export function queueExplanation(
  db: Db,
  owner: AgentReviewOwner,
  request: ExplanationRequest,
): ReviewExplanation {
  return db.transaction((tx) => {
    const { conversationId, subjects, question, headSha } = request;
    const existing = conversationId === null ? null : ownedConversation(tx, owner, conversationId);
    if (conversationId !== null && existing === null) {
      throw new UnknownConversationError('Unknown conversation');
    }
    const last = existing ? lastTurn(tx, existing.id) : undefined;
    if (last && ACTIVE.has(last.status)) {
      throw new ConversationBusyError('The agent is still answering in this conversation');
    }
    const conversation =
      existing ?? createConversation(tx, owner, conversationTitle(question, subjects));
    const explanation = tx
      .insert(schema.reviewExplanations)
      .values({
        ...(owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id }),
        conversationId: conversation.id,
        subjects,
        question,
        specs: request.specs ?? last?.specs ?? [],
        headSha,
      })
      .returning()
      .get();
    const touched = tx
      .update(schema.reviewExplainConversations)
      .set({ updatedAt: Date.now() })
      .where(eq(schema.reviewExplainConversations.id, conversation.id))
      .returning()
      .get();
    conversationChanged(tx, touched);
    changed(tx, explanation);
    return explanation;
  });
}

function ownerKey(explanation: ReviewExplanation): string {
  return explanation.ticketId === null ? `r${explanation.reviewId}` : `t${explanation.ticketId}`;
}

/** The next queued turn that can start, now running; null when none can. */
export function claimExplanation(db: Db): ReviewExplanation | null {
  return claimReviewRun(db, life);
}

export function finishExplanation(db: Db, id: number, outcome: ExplanationOutcome): void {
  const done = outcome.status === 'succeeded' ? outcome : null;
  const explanation = db
    .update(schema.reviewExplanations)
    .set({
      status: outcome.status,
      error: outcome.status === 'failed' ? outcome.error : null,
      result: done?.result ?? null,
      sessionId: done?.sessionId ?? null,
      finishedAt: Date.now(),
    })
    .where(eq(schema.reviewExplanations.id, id))
    .returning()
    .get();
  changed(db, explanation);
}

/** Cancels a turn still waiting for a slot; false when it already started (the runner stops it). */
export function cancelQueuedExplanation(db: Db, id: number): boolean {
  return cancelQueuedReviewRun(db, life, id);
}

/** Fails the turns a stopped worker left running, and returns them. */
export function failInterruptedExplanations(db: Db): ReviewExplanation[] {
  return failInterruptedReviewRuns(db, life);
}

/** The agent's output lines of a turn after line `after`, oldest first. */
export function explanationLines(
  db: Db,
  id: number,
  after: number,
): (typeof schema.agentLog.$inferSelect)[] {
  return db
    .select()
    .from(schema.agentLog)
    .where(and(eq(schema.agentLog.explanationId, id), gt(schema.agentLog.id, after)))
    .orderBy(asc(schema.agentLog.id))
    .all();
}

const life: ReviewRunLife<ReviewExplanation> = {
  table: schema.reviewExplanations,
  load: (db, id) =>
    db.select().from(schema.reviewExplanations).where(eq(schema.reviewExplanations.id, id)).get(),
  changed,
  fail: (db, id, error) => {
    finishExplanation(db, id, { status: 'failed', error });
  },
  noun: 'explanation',
  // One turn at a time per review: the oldest queued one whose review has none running.
  pick: (active) => {
    const busy = new Set(
      active.filter((row) => row.status === 'running').map((row) => ownerKey(row)),
    );
    return active.find((row) => row.status === 'queued' && !busy.has(ownerKey(row)));
  },
};
