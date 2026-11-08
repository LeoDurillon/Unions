// The explanations of a review's lines: queued by the web, claimed and finished by the worker.

import { and, asc, desc, eq, gt, inArray, type SQL } from 'drizzle-orm';

import type { AgentReviewSpec } from '../agent-review-specs';
import type { AgentReviewOwner } from '../agent-reviews';
import type { Db } from '../db';
import type { ExplanationResult } from '../schema/schema-review-explanations';
import * as schema from '../tables';
import { emitEvent } from '../tickets';
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
  ExplanationResult,
} from '../schema/schema-review-explanations';

export type ExplanationOutcome =
  | { status: 'succeeded'; result: ExplanationResult; sessionId: string }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

/** What the user asked about: lines of a file of the diff shown at `headSha`. */
export type ExplanationRequest = {
  path: string;
  side: 'old' | 'new';
  start: number;
  end: number;
  excerpt: string;
  question: string | null;
  specs: AgentReviewSpec[];
  headSha: string;
  /** The explanation a follow-up follows. */
  parentId: number | null;
};

const ACTIVE = ['queued', 'running'] as const;

/** The same lines (or the same thread) already wait for an answer. */
export class ExplanationBusyError extends Error {}

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

/** Every change is an event, as for the groupings: the panel polls while one is active. */
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

/** The owner's explanations, newest first. */
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

/** The explanation and the ones it follows, first question first. */
export function explanationThread(db: Db, explanation: ReviewExplanation): ReviewExplanation[] {
  const thread = [explanation];
  for (
    let parent = explanation.parentId === null ? null : getExplanation(db, explanation.parentId);
    parent !== null;
    parent = parent.parentId === null ? null : getExplanation(db, parent.parentId)
  ) {
    thread.unshift(parent);
  }
  return thread;
}

/** Waiting for the same thread, or for the same lines when it starts one. */
function sameAsk(request: ExplanationRequest): SQL | undefined {
  const table = schema.reviewExplanations;
  if (request.parentId !== null) {
    return eq(table.parentId, request.parentId);
  }
  return and(
    eq(table.path, request.path),
    eq(table.side, request.side),
    eq(table.startLine, request.start),
    eq(table.endLine, request.end),
  );
}

/** Queues an explanation; refused while the same lines (or thread) wait for one. */
export function queueExplanation(
  db: Db,
  owner: AgentReviewOwner,
  request: ExplanationRequest,
): ReviewExplanation {
  return db.transaction((tx) => {
    const waiting = tx
      .select()
      .from(schema.reviewExplanations)
      .where(and(owns(owner), inArray(schema.reviewExplanations.status, ACTIVE), sameAsk(request)))
      .get();
    if (waiting) {
      throw new ExplanationBusyError('The agent is already explaining these lines');
    }
    const explanation = tx
      .insert(schema.reviewExplanations)
      .values({
        ...(owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id }),
        parentId: request.parentId,
        path: request.path,
        side: request.side,
        startLine: request.start,
        endLine: request.end,
        excerpt: request.excerpt,
        question: request.question,
        specs: request.specs,
        headSha: request.headSha,
      })
      .returning()
      .get();
    changed(tx, explanation);
    return explanation;
  });
}

function ownerKey(explanation: ReviewExplanation): string {
  return explanation.ticketId === null ? `r${explanation.reviewId}` : `t${explanation.ticketId}`;
}

/** The next queued explanation that can start, now running; null when none can. */
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

/** Cancels a explanation still waiting for a slot; false when it already started (the runner stops it). */
export function cancelQueuedExplanation(db: Db, id: number): boolean {
  return cancelQueuedReviewRun(db, life, id);
}

/** Fails the explanations a stopped worker left running, and returns them. */
export function failInterruptedExplanations(db: Db): ReviewExplanation[] {
  return failInterruptedReviewRuns(db, life);
}

/** The agent's output lines of an explanation after line `after`, oldest first. */
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
  // One explanation at a time per review: the oldest queued one whose review has none running.
  pick: (active) => {
    const busy = new Set(
      active.filter((row) => row.status === 'running').map((row) => ownerKey(row)),
    );
    return active.find((row) => row.status === 'queued' && !busy.has(ownerKey(row)));
  },
};
