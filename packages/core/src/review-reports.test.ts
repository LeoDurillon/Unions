import { beforeEach, expect, test } from 'bun:test';

import { eq, sql } from 'drizzle-orm';

import type { AgentReviewOwner } from './agent-reviews';
import { createDb, migrateDb, type Db } from './db';
import {
  cancelQueuedReport,
  claimReport,
  failInterruptedReports,
  finishReport,
  latestReport,
  markNotUseful,
  queueReport,
  ReportBusyError,
  type ReportSpec,
  type ReviewReportResult,
} from './review-reports';
import * as schema from './tables';
import { createTicket } from './tickets';

let db: Db;
let ticket: AgentReviewOwner;
let review: AgentReviewOwner;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticket = { kind: 'ticket', id: createTicket(db, { projectId, title: 'T' }).id };
  const reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'PR',
      url: 'u',
      author: 'alice',
      headBranch: 'b',
      baseBranch: 'main',
    })
    .returning()
    .get().id;
  review = { kind: 'review', id: reviewId };
});

const specs: ReportSpec[] = [{ id: 1, kind: 'ticket', label: 'Ticket', text: 'Do it' }];

/** A result as reports stored it before the triage. */
const older = {
  verdict: 'matches',
  summary: 'Done.',
  importantFiles: [],
  requirements: [],
  outOfScope: [],
  risks: [],
  questions: [],
  docs: [],
  dropped: 0,
};

const result: ReviewReportResult = {
  ...older,
  verdict: 'matches',
  flow: { nodes: [], edges: [], steps: [] },
  attention: [],
  skim: [],
  unreviewed: [],
};

function reportEvents(): unknown[] {
  return db
    .select()
    .from(schema.events)
    .where(eq(schema.events.type, 'review_report_changed'))
    .all()
    .map((event) => event.payload);
}

test('a queued report keeps its specs and is the latest of its owner only', () => {
  const report = queueReport(db, ticket, specs);
  expect(report).toMatchObject({ status: 'queued', ticketId: ticket.id, reviewId: null, specs });
  expect(latestReport(db, ticket)?.id).toBe(report.id);
  expect(latestReport(db, review)).toBeNull();
  expect(reportEvents()).toEqual([
    { reportId: report.id, reviewId: null, status: 'queued', error: null },
  ]);
});

test('a second report is refused while one is queued or running', () => {
  queueReport(db, review, specs);
  expect(() => queueReport(db, review, specs)).toThrow(ReportBusyError);
  claimReport(db);
  expect(() => queueReport(db, review, specs)).toThrow(ReportBusyError);
  expect(() => queueReport(db, ticket, specs)).not.toThrow();
});

test('a new report replaces the finished ones', () => {
  const first = queueReport(db, ticket, specs);
  finishReport(db, first.id, { status: 'succeeded', headSha: 'abc', result });
  const second = queueReport(db, ticket, specs);
  expect(
    db
      .select()
      .from(schema.reviewReports)
      .all()
      .map((r) => r.id),
  ).toEqual([second.id]);
});

test('a report stored before the triage reads with its lists empty', () => {
  const report = queueReport(db, ticket, specs);
  db.run(sql`update review_reports set result = ${JSON.stringify(older)} where id = ${report.id}`);
  expect(latestReport(db, ticket)?.result).toEqual(result);
});

test('claims the oldest queued report and finishes it with its result', () => {
  const first = queueReport(db, ticket, specs);
  queueReport(db, review, specs);
  const claimed = claimReport(db);
  expect(claimed).toMatchObject({ id: first.id, status: 'running' });
  expect(claimed?.startedAt).toBeNumber();
  finishReport(db, first.id, { status: 'succeeded', headSha: 'abc', result });
  expect(latestReport(db, ticket)).toMatchObject({
    status: 'succeeded',
    headSha: 'abc',
    result,
    error: null,
    raw: null,
  });
});

test("a failed report keeps the agent's text when its block could not be read", () => {
  const report = queueReport(db, ticket, specs);
  claimReport(db);
  finishReport(db, report.id, { status: 'failed', error: 'No report block', raw: 'Some text' });
  expect(latestReport(db, ticket)).toMatchObject({
    status: 'failed',
    error: 'No report block',
    raw: 'Some text',
    result: null,
  });
});

test('only a queued report is cancelled here; a running one is left to the runner', () => {
  const queued = queueReport(db, ticket, specs);
  expect(cancelQueuedReport(db, queued.id)).toBe(true);
  expect(latestReport(db, ticket)?.status).toBe('cancelled');
  const running = queueReport(db, ticket, specs);
  claimReport(db);
  expect(cancelQueuedReport(db, running.id)).toBe(false);
  expect(latestReport(db, ticket)?.status).toBe('running');
});

test('the reports a stopped worker left running fail', () => {
  const report = queueReport(db, ticket, specs);
  claimReport(db);
  queueReport(db, review, specs);
  expect(failInterruptedReports(db).map((r) => r.id)).toEqual([report.id]);
  expect(latestReport(db, ticket)).toMatchObject({
    status: 'failed',
    error: 'The worker stopped during the report',
  });
  expect(latestReport(db, review)?.status).toBe('queued');
});

test('a report goes with its ticket or its review', () => {
  queueReport(db, ticket, specs);
  queueReport(db, review, specs);
  db.delete(schema.tickets).where(eq(schema.tickets.id, ticket.id)).run();
  db.delete(schema.currentReviews).where(eq(schema.currentReviews.id, review.id)).run();
  expect(db.select().from(schema.reviewReports).all()).toEqual([]);
});

test('an item marked not useful is kept on the report, flagged; a missing one is refused', () => {
  const report = queueReport(db, ticket, specs);
  const item = { kind: 'risk' as const, title: 'Locks', detail: '', requirement: null, cites: [] };
  finishReport(db, report.id, {
    status: 'succeeded',
    headSha: 'abc',
    result: { ...result, attention: [item, { ...item, title: 'Slow' }] },
  });
  expect(markNotUseful(db, report.id, 9)).toBeNull();
  const marked = markNotUseful(db, report.id, 1);
  expect(marked?.result?.attention.map((a) => a.notUseful ?? false)).toEqual([false, true]);
  expect(latestReport(db, ticket)?.result?.attention[1]?.notUseful).toBe(true);
});
