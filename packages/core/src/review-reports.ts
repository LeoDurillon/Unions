// Spec reports of a review: queued, claimed, finished and cancelled, one at a time per change.
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';

import type { AgentReviewOwner } from './agent-reviews';
import type { Db } from './db';
import type { ReportSpec, ReviewReportResult } from './review-report-types';
import {
  cancelQueuedReviewRun,
  claimReviewRun,
  failInterruptedReviewRuns,
  type ReviewRunLife,
} from './review-run-lifecycle';
import * as schema from './tables';
import { emitEvent } from './tickets';

export type ReviewReport = typeof schema.reviewReports.$inferSelect;
export type * from './review-report-types';
export {
  ATTENTION_KINDS,
  WHY_SOURCES,
  IMPORTANT_FILE_KINDS,
  REPORT_LEVELS,
  REPORT_VERDICTS,
  REQUIREMENT_STATUSES,
} from './review-report-types';

export type ReportOutcome =
  | { status: 'succeeded'; headSha: string; result: ReviewReportResult }
  | { status: 'failed'; error: string; raw?: string }
  | { status: 'cancelled' };

const ACTIVE = ['queued', 'running'] as const;

/** A report is already queued or running for this change. */
export class ReportBusyError extends Error {}

function owns(owner: AgentReviewOwner): SQL {
  return owner.kind === 'ticket'
    ? eq(schema.reviewReports.ticketId, owner.id)
    : eq(schema.reviewReports.reviewId, owner.id);
}

type Executor = Parameters<typeof emitEvent>[0];

/** Every change is an event: the ticket's review page refreshes on it (a PR's polls). */
function changed(db: Executor, report: ReviewReport): void {
  emitEvent(db, {
    type: 'review_report_changed',
    ticketId: report.ticketId ?? undefined,
    payload: {
      reportId: report.id,
      reviewId: report.reviewId,
      status: report.status,
      error: report.error,
    },
  });
}

/**
 * A report written before the triage (what needs the reviewer, what to skim) or the map of how the
 * change works has none of their lists.
 */
function filled(report: ReviewReport): ReviewReport {
  if (!report.result) {
    return report;
  }
  const stored: Partial<ReviewReportResult> = report.result;
  const { attention = [], skim = [], unreviewed = [] } = stored;
  const flow = stored.flow ?? { nodes: [], edges: [], steps: [] };
  return { ...report, result: { ...report.result, flow, attention, skim, unreviewed } };
}

/** The newest report on the change, whatever its status. */
export function latestReport(db: Db, owner: AgentReviewOwner): ReviewReport | null {
  const report = db
    .select()
    .from(schema.reviewReports)
    .where(owns(owner))
    .orderBy(desc(schema.reviewReports.id))
    .get();
  return report ? filled(report) : null;
}

/**
 * Queues a report on the given specs; refused while one is queued or running for the same change.
 * Only the newest is shown: the older finished ones go.
 */
export function queueReport(db: Db, owner: AgentReviewOwner, specs: ReportSpec[]): ReviewReport {
  return db.transaction((tx) => {
    const active = tx
      .select({ id: schema.reviewReports.id })
      .from(schema.reviewReports)
      .where(and(owns(owner), inArray(schema.reviewReports.status, ACTIVE)))
      .get();
    if (active) {
      throw new ReportBusyError('The agent is already writing a report on this change');
    }
    tx.delete(schema.reviewReports).where(owns(owner)).run();
    const report = tx
      .insert(schema.reviewReports)
      .values({
        ...(owner.kind === 'ticket' ? { ticketId: owner.id } : { reviewId: owner.id }),
        specs,
      })
      .returning()
      .get();
    changed(tx, report);
    return report;
  });
}

/** The next queued report that can start, now running; null when none can. */
export function claimReport(db: Db): ReviewReport | null {
  return claimReviewRun(db, life);
}

export function finishReport(db: Db, id: number, outcome: ReportOutcome): void {
  const report = db
    .update(schema.reviewReports)
    .set({
      status: outcome.status,
      error: outcome.status === 'failed' ? outcome.error : null,
      raw: outcome.status === 'failed' ? (outcome.raw ?? null) : null,
      result: outcome.status === 'succeeded' ? outcome.result : null,
      headSha: outcome.status === 'succeeded' ? outcome.headSha : null,
      finishedAt: Date.now(),
    })
    .where(eq(schema.reviewReports.id, id))
    .returning()
    .get();
  changed(db, report);
}

/** Cancels a report still waiting for a slot; false when it already started (the runner stops it). */
export function cancelQueuedReport(db: Db, id: number): boolean {
  return cancelQueuedReviewRun(db, life, id);
}

/** Fails the reports a stopped worker left running, and returns them. */
export function failInterruptedReports(db: Db): ReviewReport[] {
  return failInterruptedReviewRuns(db, life);
}

/**
 * Marks the item at `index` of what needs the reviewer not useful, on a finished report; the report,
 * or null when it has no such item.
 */
export function markNotUseful(db: Db, reportId: number, index: number): ReviewReport | null {
  const report = db
    .select()
    .from(schema.reviewReports)
    .where(eq(schema.reviewReports.id, reportId))
    .get();
  const item = report?.result?.attention[index];
  if (!report?.result || !item) {
    return null;
  }
  const attention = report.result.attention.with(index, { ...item, notUseful: true });
  const updated = db
    .update(schema.reviewReports)
    .set({ result: { ...report.result, attention } })
    .where(eq(schema.reviewReports.id, reportId))
    .returning()
    .get();
  changed(db, updated);
  return filled(updated);
}

const life: ReviewRunLife<ReviewReport> = {
  table: schema.reviewReports,
  load: (db, id) =>
    db.select().from(schema.reviewReports).where(eq(schema.reviewReports.id, id)).get(),
  changed,
  fail: (db, id, error) => {
    finishReport(db, id, { status: 'failed', error });
  },
  noun: 'report',
};
