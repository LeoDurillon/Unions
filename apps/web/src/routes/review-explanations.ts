// The explanations of a review's lines: listed with their spec parts, queued, cancelled, and their progress.
import {
  explanationLines,
  explanationOwner,
  explanationSpecParts,
  explanationsOf,
  ExplanationBusyError,
  getExplanation,
  latestGrouping,
  queueExplanation,
  schema,
  type Db,
  type ReviewExplanation,
  type SpecPart,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { ACCEPTED, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';
import { explanationRequest } from './explanation-request';
import type { GroupingTarget } from './review-groupings';

/** What the panel shows of an explanation; `specs` are only the names of the specs it was given. */
export type ExplanationView = Omit<
  ReviewExplanation,
  'specs' | 'sessionId' | 'ticketId' | 'reviewId'
> & {
  specs: string[];
  /** The review shows another commit now. */
  outdated: boolean;
  /** The parts of the review's grouping by spec the lines belong to (none without a grouping). */
  specParts: SpecPart[];
  /** That grouping read another commit than the one shown now. */
  partsOutdated: boolean;
};

export type ExplanationLogView = { lines: { id: number; payload: unknown }[] };

type Parts = Pick<ExplanationView, 'specParts' | 'partsOutdated'>;

/** The spec parts of each explanation's lines, from the review's newest succeeded grouping. */
function partsFinder(db: Db, target: GroupingTarget): (explanation: ReviewExplanation) => Parts {
  const grouping = latestGrouping(db, target.owner);
  const result = grouping?.status === 'succeeded' ? grouping.result : null;
  const partsOutdated = grouping?.headSha !== target.headSha;
  return (explanation) => {
    const patch = target.patchOf(explanation.path);
    if (!result || patch === undefined) {
      return { specParts: [], partsOutdated: false };
    }
    const { path, side, startLine: start, endLine: end } = explanation;
    return {
      specParts: explanationSpecParts(result, { path, patch }, { side, start, end }),
      partsOutdated,
    };
  };
}

function view(
  explanation: ReviewExplanation,
  target: GroupingTarget,
  parts: Parts,
): ExplanationView {
  const { specs, sessionId: _session, ticketId: _ticket, reviewId: _review, ...rest } = explanation;
  return {
    ...rest,
    specs: specs.map((spec) => spec.label),
    outdated: target.headSha !== null && explanation.headSha !== target.headSha,
    ...parts,
  };
}

function list(db: Db, c: Context, target: GroupingTarget): Response {
  const parts = partsFinder(db, target);
  const views = explanationsOf(db, target.owner).map((row) => view(row, target, parts(row)));
  return c.json(views);
}

async function queue(db: Db, c: Context, target: GroupingTarget): Promise<Response> {
  if (target.refusal !== null) {
    throw fail(CONFLICT, target.refusal);
  }
  const request = explanationRequest(db, target, await readObject(c.req.raw));
  try {
    const explanation = queueExplanation(db, target.owner, request);
    return c.json(view(explanation, target, partsFinder(db, target)(explanation)), ACCEPTED);
  } catch (error) {
    if (error instanceof ExplanationBusyError) {
      throw fail(CONFLICT, error.message);
    }
    throw error;
  }
}

function owned(db: Db, c: Context, target: GroupingTarget): ReviewExplanation {
  const explanation = getExplanation(db, requireId(c.req.param('explanationId'), 'explanation id'));
  const owner = explanation ? explanationOwner(explanation) : null;
  if (!explanation || owner?.kind !== target.owner.kind || owner.id !== target.owner.id) {
    throw fail(NOT_FOUND, 'Unknown explanation');
  }
  return explanation;
}

/** The worker cancels a queued one and stops a running one. */
function cancel(db: Db, c: Context, target: GroupingTarget): Response {
  const explanation = owned(db, c, target);
  if (explanation.status !== 'queued' && explanation.status !== 'running') {
    throw fail(CONFLICT, 'The agent is not explaining these lines');
  }
  db.insert(schema.commands)
    .values({ type: 'cancel_review_explanation', payload: { explanationId: explanation.id } })
    .run();
  return c.json(view(explanation, target, partsFinder(db, target)(explanation)), ACCEPTED);
}

function log(db: Db, c: Context, target: GroupingTarget): Response {
  const explanation = owned(db, c, target);
  const after = Number(c.req.query('after') ?? 0);
  const lines = explanationLines(db, explanation.id, Number.isInteger(after) ? after : 0);
  const body: ExplanationLogView = { lines: lines.map(({ id, payload }) => ({ id, payload })) };
  return c.json(body);
}

/**
 * Under a review's base (`/api/tickets/:id`, `/api/projects/:projectId/pull-requests/reviews/:number`):
 * `/explanations` (newest first), `POST /explanations` (lines, or a follow-up's `parentId`),
 * `/explanations/:explanationId/cancel` and `/explanations/:explanationId/log`.
 */
export function reviewExplanationRoutes(db: Db, targetOf: (c: Context) => GroupingTarget): Hono {
  const routes = new Hono();
  routes.get('/', (c) => list(db, c, targetOf(c)));
  routes.post('/', (c) => queue(db, c, targetOf(c)));
  routes.post('/:explanationId/cancel', (c) => cancel(db, c, targetOf(c)));
  routes.get('/:explanationId/log', (c) => log(db, c, targetOf(c)));
  return routes;
}
