// Under a review's base (`/api/tickets/:id`, `/api/projects/:projectId/pull-requests/reviews/:number`):
// `/reports` (the newest spec report), `POST /reports` (queue one on the review's specs), `/reports/cancel`,
// `/reports/gaps` (a draft asking for the requirements it found not met).
import {
  distinctSpecs,
  latestReport,
  MAX_SPEC_CHARS,
  MAX_SPECS,
  queueReport,
  ReportBusyError,
  schema,
  type Db,
  type ReportSpec,
  type ReviewReport,
  type ReviewReportResult,
} from '@union/core';
import { reportGaps } from '@union/core/review-report-markdown';
import { Hono, type Context } from 'hono';

import { ACCEPTED, CONFLICT, CREATED, fail } from '../http';
import { addGeneralDraft } from '../review-output-comment';
import type { ReviewSpecView } from '../review-spec-types';
import type { GroupingTarget } from './review-groupings';
import { readReviewSpecs } from './review-specs';
import type { SpecReaders } from './spec-sources';

/** What the review page shows of the newest report: the specs it read by name, not their text. */
export type ReportView = Pick<
  ReviewReport,
  'id' | 'status' | 'error' | 'raw' | 'createdAt' | 'startedAt' | 'finishedAt'
> & {
  specs: Omit<ReportSpec, 'text'>[];
  result: ReviewReportResult | null;
  outdated: boolean;
};

function view(report: ReviewReport | null, target: GroupingTarget): ReportView | null {
  if (!report) {
    return null;
  }
  const { id, status, error, raw, createdAt, startedAt, finishedAt, result } = report;
  return {
    id,
    status,
    error,
    raw,
    createdAt,
    startedAt,
    finishedAt,
    specs: report.specs.map(({ id: specId, kind, label, sameAs }) => ({
      id: specId,
      kind,
      label,
      sameAs,
    })),
    result,
    outdated:
      status === 'succeeded' && target.headSha !== null && report.headSha !== target.headSha,
  };
}

/**
 * The specs a report reads: the review's, as the Specs bar shows them, without the removed ones and
 * the ones whose source could not be read; numbered for the agent to cite, images out, one another
 * holds sent once (`distinctSpecs`).
 */
function reportSpecsOf(views: ReviewSpecView[]): ReportSpec[] {
  const readable = views.flatMap((spec) =>
    !spec.removed && spec.current !== null && spec.current.trim() !== ''
      ? [{ kind: spec.kind, label: spec.label, text: spec.current.trim() }]
      : [],
  );
  if (readable.length === 0) {
    throw fail(CONFLICT, 'No spec can be read: add one in the Specs bar first.');
  }
  if (readable.length > MAX_SPECS) {
    throw fail(CONFLICT, `At most ${MAX_SPECS} specs: remove some in the Specs bar.`);
  }
  const specs = distinctSpecs(readable);
  const long = specs.find((spec) => spec.text.length > MAX_SPEC_CHARS);
  if (long) {
    throw fail(
      CONFLICT,
      `${long.label} is longer than ${MAX_SPEC_CHARS} characters: edit it in the Specs bar to keep the part that matters.`,
    );
  }
  return specs;
}

async function start(readers: SpecReaders, c: Context, target: GroupingTarget): Promise<Response> {
  if (target.refusal !== null) {
    throw fail(CONFLICT, target.refusal);
  }
  const specs = reportSpecsOf(await readReviewSpecs(readers, target));
  try {
    queueReport(readers.db, target.owner, specs);
  } catch (error) {
    if (error instanceof ReportBusyError) {
      throw fail(CONFLICT, error.message);
    }
    throw error;
  }
  return c.json(view(latestReport(readers.db, target.owner), target), ACCEPTED);
}

function cancel(db: Db, c: Context, target: GroupingTarget): Response {
  const report = latestReport(db, target.owner);
  if (report?.status !== 'queued' && report?.status !== 'running') {
    throw fail(CONFLICT, 'The agent is not writing a report on this change');
  }
  db.insert(schema.commands)
    .values({ type: 'cancel_review_report', payload: { reportId: report.id } })
    .run();
  return c.json(view(report, target), ACCEPTED);
}

/** A draft on the whole change asking for what the current report found not met. */
function addGaps(db: Db, c: Context, target: GroupingTarget): Response {
  const report = latestReport(db, target.owner);
  const shown = view(report, target);
  if (!report?.result || !shown) {
    throw fail(CONFLICT, 'No finished report on this change');
  }
  if (shown.outdated) {
    throw fail(CONFLICT, 'The report is outdated: run it again first.');
  }
  const body = reportGaps(report.result, report.specs);
  if (body === null) {
    throw fail(CONFLICT, 'The report found every requirement met');
  }
  return c.json(addGeneralDraft(db, target.owner, target.headSha, body), CREATED);
}

/**
 * Under a review's base (`/api/tickets/:id`, `/api/projects/:projectId/pull-requests/reviews/:number`):
 * `/reports` (the newest spec report), `POST /reports` (queue one on the review's specs),
 * `/reports/cancel`, `/reports/gaps` (a draft asking for the requirements it found not met).
 */
export function reviewReportRoutes(
  readers: SpecReaders,
  targetOf: (c: Context) => GroupingTarget,
): Hono {
  const routes = new Hono();
  routes.get('/', (c) => {
    const target = targetOf(c);
    return c.json(view(latestReport(readers.db, target.owner), target));
  });
  routes.post('/', (c) => start(readers, c, targetOf(c)));
  routes.post('/cancel', (c) => cancel(readers.db, c, targetOf(c)));
  routes.post('/gaps', (c) => addGaps(readers.db, c, targetOf(c)));
  return routes;
}
