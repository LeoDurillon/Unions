// Groupings of a review's files by spec: queued, claimed, finished and cancelled, one at a time per
// change.
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';

import type { AgentReviewOwner } from './agent-reviews';
import type { Db } from './db';
import type { GroupingResult, SpecSource } from './schema-review-groupings';
import * as schema from './tables';
import { emitEvent } from './tickets';

export type ReviewGrouping = typeof schema.reviewGroupings.$inferSelect;
export type {
  GroupingResult,
  SpecGroup,
  SpecSource,
  UnrelatedChange,
} from './schema-review-groupings';
export { SPEC_SOURCES } from './schema-review-groupings';

export type GroupingOutcome =
  | { status: 'succeeded'; headSha: string; result: GroupingResult }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

/** The specification a grouping reads, as the user chose and edited it. */
export type GroupingSpec = { kind: SpecSource; label: string; spec: string };

const ACTIVE = ['queued', 'running'] as const;

/** A grouping is already queued or running for this change. */
export class GroupingBusyError extends Error {}

function owns(owner: AgentReviewOwner): SQL {
  return owner.kind === 'ticket'
    ? eq(schema.reviewGroupings.ticketId, owner.id)
    : eq(schema.reviewGroupings.reviewId, owner.id);
}

type Executor = Parameters<typeof emitEvent>[0];

/** Every change is an event: the ticket's review page refreshes on it (a PR's polls). */
function changed(db: Executor, grouping: ReviewGrouping): void {
  emitEvent(db, {
    type: 'review_grouping_changed',
    ticketId: grouping.ticketId ?? undefined,
    payload: {
      groupingId: grouping.id,
      reviewId: grouping.reviewId,
      status: grouping.status,
      error: grouping.error,
    },
  });
}

/** The newest grouping of the change, whatever its status. */
export function latestGrouping(db: Db, owner: AgentReviewOwner): ReviewGrouping | null {
  return (
    db
      .select()
      .from(schema.reviewGroupings)
      .where(owns(owner))
      .orderBy(desc(schema.reviewGroupings.id))
      .get() ?? null
  );
}

/**
 * Queues a grouping; refused while one is queued or running for the same change. Only the newest is
 * shown: the older finished ones go.
 */
export function queueGrouping(db: Db, owner: AgentReviewOwner, spec: GroupingSpec): ReviewGrouping {
  return db.transaction((tx) => {
    const active = tx
      .select()
      .from(schema.reviewGroupings)
      .where(and(owns(owner), inArray(schema.reviewGroupings.status, ACTIVE)))
      .get();
    if (active) {
      throw new GroupingBusyError('The agent is already grouping this change');
    }
    tx.delete(schema.reviewGroupings).where(owns(owner)).run();
    const grouping = tx
      .insert(schema.reviewGroupings)
      .values({
        ...(owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id }),
        sourceKind: spec.kind,
        sourceLabel: spec.label,
        spec: spec.spec,
      })
      .returning()
      .get();
    changed(tx, grouping);
    return grouping;
  });
}

/** The oldest queued grouping, now running; null when none waits. */
export function claimGrouping(db: Db): ReviewGrouping | null {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(schema.reviewGroupings)
      .where(eq(schema.reviewGroupings.status, 'queued'))
      .orderBy(asc(schema.reviewGroupings.id))
      .get();
    if (!next) {
      return null;
    }
    const grouping = tx
      .update(schema.reviewGroupings)
      .set({ status: 'running', startedAt: Date.now() })
      .where(eq(schema.reviewGroupings.id, next.id))
      .returning()
      .get();
    changed(tx, grouping);
    return grouping;
  });
}

export function finishGrouping(db: Db, id: number, outcome: GroupingOutcome): void {
  const grouping = db
    .update(schema.reviewGroupings)
    .set({
      status: outcome.status,
      error: outcome.status === 'failed' ? outcome.error : null,
      result: outcome.status === 'succeeded' ? outcome.result : null,
      headSha: outcome.status === 'succeeded' ? outcome.headSha : null,
      finishedAt: Date.now(),
    })
    .where(eq(schema.reviewGroupings.id, id))
    .returning()
    .get();
  changed(db, grouping);
}

/** Cancels a grouping still waiting for a slot; false when it already started (the runner stops it). */
export function cancelQueuedGrouping(db: Db, id: number): boolean {
  const [grouping] = db
    .update(schema.reviewGroupings)
    .set({ status: 'cancelled', finishedAt: Date.now() })
    .where(and(eq(schema.reviewGroupings.id, id), eq(schema.reviewGroupings.status, 'queued')))
    .returning()
    .all();
  if (!grouping) {
    return false;
  }
  changed(db, grouping);
  return true;
}

/** Fails the groupings a stopped worker left running, and returns them. */
export function failInterruptedGroupings(db: Db): ReviewGrouping[] {
  const running = db
    .select()
    .from(schema.reviewGroupings)
    .where(eq(schema.reviewGroupings.status, 'running'))
    .all();
  for (const grouping of running) {
    finishGrouping(db, grouping.id, {
      status: 'failed',
      error: 'The worker stopped during the grouping',
    });
  }
  return running;
}
