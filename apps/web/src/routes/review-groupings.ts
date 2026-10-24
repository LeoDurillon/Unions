// Under a review's base (`/api/tickets/:id`,
// `/api/projects/:projectId/pull-requests/reviews/:number`): `/groupings` (the newest),
// `/groupings/source` (a specification's text, for the user to check and edit), `POST /groupings`
// (queue the agent), `/groupings/cancel`.
import {
  GroupingBusyError,
  latestGrouping,
  queueGrouping,
  schema,
  SPEC_SOURCES,
  type AgentReviewOwner,
  type Db,
  type GroupingResult,
  type Project,
  type ReviewGrouping,
  type SpecEntry,
  type SpecSource,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { ACCEPTED, BAD_REQUEST, CONFLICT, fail, readObject, requireText } from '../http';
import { readSpec, type SpecReaders } from './spec-sources';

const MAX_SPEC_CHARS = 50_000;

/** A review the grouping belongs to: a ticket's branch or a pull request under review. */
export type GroupingTarget = {
  owner: AgentReviewOwner;
  project: Project;
  /** The pull request whose description is the default specification, if any. */
  prNumber: number | null;
  /** The ticket's own text, for a ticket's review. */
  ticketText: string | null;
  /** What the review's spec list starts with (`review_specs`): the ticket's text and page, or the PR's description. */
  starts: SpecEntry[];
  /** The commit the review shows now: a grouping read at another one is outdated. */
  headSha: string | null;
  /** Why the agent cannot read the change now; null when it can. */
  refusal: string | null;
  /** A file's patch in the diff the review shows now; read when asked. */
  patchOf: (path: string) => string | undefined;
};

/** What the review page shows of the newest grouping. */
export type GroupingView = Pick<
  ReviewGrouping,
  'id' | 'status' | 'sourceKind' | 'sourceLabel' | 'spec' | 'error' | 'createdAt' | 'finishedAt'
> & { result: GroupingResult | null; outdated: boolean };

function view(grouping: ReviewGrouping | null, target: GroupingTarget): GroupingView | null {
  if (!grouping) {
    return null;
  }
  const { id, status, sourceKind, sourceLabel, spec, error, createdAt, finishedAt, result } =
    grouping;
  const outdated =
    status === 'succeeded' && target.headSha !== null && grouping.headSha !== target.headSha;
  return {
    id,
    status,
    sourceKind,
    sourceLabel,
    spec,
    error,
    createdAt,
    finishedAt,
    result,
    outdated,
  };
}

function isSource(value: unknown): value is SpecSource {
  return SPEC_SOURCES.some((source) => source === value);
}

function sourceOf(body: Record<string, unknown>): SpecSource {
  if (!isSource(body.kind)) {
    throw fail(BAD_REQUEST, `"kind" must be one of ${SPEC_SOURCES.join(', ')}`);
  }
  return body.kind;
}

async function start(db: Db, c: Context, target: GroupingTarget): Promise<Response> {
  if (target.refusal !== null) {
    throw fail(CONFLICT, target.refusal);
  }
  const body = await readObject(c.req.raw);
  const spec = requireText(body, 'spec').trim();
  if (spec.length > MAX_SPEC_CHARS) {
    throw fail(BAD_REQUEST, `A specification can be at most ${MAX_SPEC_CHARS} characters`);
  }
  try {
    queueGrouping(db, target.owner, {
      kind: sourceOf(body),
      label:
        typeof body.label === 'string' && body.label.trim() !== ''
          ? body.label.trim()
          : 'Specification',
      spec,
    });
  } catch (error) {
    if (error instanceof GroupingBusyError) {
      throw fail(CONFLICT, error.message);
    }
    throw error;
  }
  return c.json(view(latestGrouping(db, target.owner), target), ACCEPTED);
}

function cancel(db: Db, c: Context, target: GroupingTarget): Response {
  const grouping = latestGrouping(db, target.owner);
  if (grouping?.status !== 'queued' && grouping?.status !== 'running') {
    throw fail(CONFLICT, 'The agent is not grouping this change');
  }
  db.insert(schema.commands)
    .values({ type: 'cancel_review_grouping', payload: { groupingId: grouping.id } })
    .run();
  return c.json(view(grouping, target), ACCEPTED);
}

/**
 * Under a review's base (`/api/tickets/:id`, `/api/projects/:projectId/pull-requests/reviews/:number`):
 * `/groupings` (the newest), `/groupings/source` (a specification's text, for the user to check and
 * edit), `POST /groupings` (queue the agent), `/groupings/cancel`.
 */
export function reviewGroupingRoutes(
  db: Db,
  readers: Omit<SpecReaders, 'db'>,
  targetOf: (c: Context) => GroupingTarget,
): Hono {
  const routes = new Hono();
  routes.get('/', (c) => {
    const target = targetOf(c);
    return c.json(view(latestGrouping(db, target.owner), target));
  });
  routes.post('/source', async (c) => {
    const target = targetOf(c);
    const body = await readObject(c.req.raw);
    const ref = typeof body.ref === 'string' ? body.ref.trim() : '';
    return c.json(await readSpec({ db, ...readers }, target, sourceOf(body), ref));
  });
  routes.post('/', (c) => start(db, c, targetOf(c)));
  routes.post('/cancel', (c) => cancel(db, c, targetOf(c)));
  return routes;
}
