// Review agents' runs on a review's change: queued by the web, one at a time per change, claimed and finished by the worker.
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';

import type { AgentReviewOwner } from './agent-reviews';
import { findCustomAgent } from './custom-agents';
import type { Db } from './db';
import type { ReportSpec } from './review-report-types';
import * as tables from './tables';
import { emitEvent } from './tickets';

export type ReviewAgentRun = typeof tables.reviewAgentRuns.$inferSelect;

export type ReviewAgentRunOutcome =
  | { status: 'succeeded'; headSha: string; output: string }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

/** Why a run is refused: the web answers 400 or 409 by `reason`. */
export class ReviewAgentRunError extends Error {
  constructor(
    message: string,
    readonly reason: 'invalid' | 'busy',
  ) {
    super(message);
  }
}

const runs = tables.reviewAgentRuns;
const BUSY = ['queued', 'running'] as const;

function ownedBy(owner: AgentReviewOwner): SQL {
  return owner.kind === 'ticket' ? eq(runs.ticketId, owner.id) : eq(runs.reviewId, owner.id);
}

type Executor = Parameters<typeof emitEvent>[0];

/** Logs the run's new state: the review page refreshes on it. */
function logged(db: Executor, run: ReviewAgentRun): ReviewAgentRun {
  emitEvent(db, {
    type: 'review_agent_run_changed',
    ticketId: run.ticketId ?? undefined,
    payload: {
      runId: run.id,
      agentId: run.agentId,
      reviewId: run.reviewId,
      status: run.status,
      error: run.error,
    },
  });
  return run;
}

function refuseUnready(db: Db, agentId: number): void {
  const agent = findCustomAgent(db, agentId);
  if (!agent || agent.deletedAt !== null || agent.kind !== 'review') {
    throw new ReviewAgentRunError(`No review agent ${agentId}`, 'invalid');
  }
  if (agent.defaultPrompt === null) {
    throw new ReviewAgentRunError(`${agent.name} has no prompt yet`, 'invalid');
  }
}

/**
 * Queues `agentId` on the change with the review's specs. Refused while any review agent's run waits or runs on it; the
 * agent's older runs on the change go, since only the newest is shown.
 */
export function queueReviewAgentRun(
  db: Db,
  owner: AgentReviewOwner,
  agentId: number,
  specs: ReportSpec[] = [],
): ReviewAgentRun {
  refuseUnready(db, agentId);
  return db.transaction((tx) => {
    const busy = tx
      .select({ agentId: runs.agentId })
      .from(runs)
      .where(and(ownedBy(owner), inArray(runs.status, BUSY)))
      .get();
    if (busy) {
      throw new ReviewAgentRunError('A review agent is already running on this change', 'busy');
    }
    tx.delete(runs)
      .where(and(ownedBy(owner), eq(runs.agentId, agentId)))
      .run();
    const owned = owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id };
    return logged(
      tx,
      tx
        .insert(runs)
        .values({ ...owned, agentId, specs })
        .returning()
        .get(),
    );
  });
}

/** The newest run of each agent on the change, oldest agent first. */
export function latestReviewAgentRuns(db: Db, owner: AgentReviewOwner): ReviewAgentRun[] {
  const newest = new Map<number, ReviewAgentRun>();
  for (const run of db.select().from(runs).where(ownedBy(owner)).orderBy(desc(runs.id)).all()) {
    if (!newest.has(run.agentId)) {
      newest.set(run.agentId, run);
    }
  }
  return [...newest.values()].toSorted((a, b) => a.agentId - b.agentId);
}

/** The oldest queued run, now running; null when none waits. */
export function claimReviewAgentRun(db: Db): ReviewAgentRun | null {
  return db.transaction((tx) => {
    const queued = tx
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.status, 'queued'))
      .orderBy(asc(runs.id))
      .get();
    return queued
      ? logged(
          tx,
          tx
            .update(runs)
            .set({ status: 'running', startedAt: Date.now() })
            .where(eq(runs.id, queued.id))
            .returning()
            .get(),
        )
      : null;
  });
}

export function finishReviewAgentRun(db: Db, id: number, outcome: ReviewAgentRunOutcome): void {
  const done = outcome.status === 'succeeded' ? outcome : null;
  const run = db
    .update(runs)
    .set({
      status: outcome.status,
      output: done?.output ?? null,
      headSha: done?.headSha ?? null,
      error: outcome.status === 'failed' ? outcome.error : null,
      finishedAt: Date.now(),
    })
    .where(eq(runs.id, id))
    .returning()
    .get();
  logged(db, run);
}

/** Cancels a run still waiting for a slot; false once it started (the runner stops it then). */
export function cancelQueuedReviewAgentRun(db: Db, id: number): boolean {
  const cancelled = db
    .update(runs)
    .set({ status: 'cancelled', finishedAt: Date.now() })
    .where(and(eq(runs.id, id), eq(runs.status, 'queued')))
    .returning()
    .all();
  for (const run of cancelled) {
    logged(db, run);
  }
  return cancelled.length > 0;
}

/** Fails the runs a stopped worker left running, and returns them for their containers to go. */
export function failInterruptedReviewAgentRuns(db: Db): ReviewAgentRun[] {
  const left = db.select().from(runs).where(eq(runs.status, 'running')).all();
  for (const run of left) {
    finishReviewAgentRun(db, run.id, {
      status: 'failed',
      error: 'The worker stopped during the run',
    });
  }
  return left;
}
