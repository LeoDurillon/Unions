// Under a review's base: `/review-agents` (the review agents it can run, and each one's newest run on the change), `POST /review-agents` (run one on the review's specs), `/review-agents/:runId/cancel`.

import {
  latestReviewAgentRuns,
  listCustomAgents,
  queueReviewAgentRun,
  readyReviewAgents,
  ReviewAgentRunError,
  schema,
  type Db,
  type ReviewAgentRun,
} from '@union/core';
import { Hono, type Context } from 'hono';

import {
  ACCEPTED,
  BAD_REQUEST,
  CONFLICT,
  fail,
  NOT_FOUND,
  readObject,
  requireId,
} from '../../http';
import type { SpecReaders } from '../spec-sources';
import type { GroupingTarget } from './review-groupings';
import { readableSpecs } from './review-reports';
import { readReviewSpecs } from './review-specs';

/** One run as the review page shows it: the specs it read by name, and whether the change moved since. */
export type ReviewAgentRunView = Pick<
  ReviewAgentRun,
  'id' | 'agentId' | 'status' | 'output' | 'error' | 'createdAt' | 'startedAt' | 'finishedAt'
> & { agentName: string; specs: string[]; outdated: boolean };

export type ReviewAgentsView = {
  /** The review agents that can run: live, of the review kind, their prompt written. */
  agents: { id: number; name: string }[];
  /** The newest run of each agent on this change, deleted agents' included. */
  runs: ReviewAgentRunView[];
  /** Why no agent can read the change now; null when one can. */
  refusal: string | null;
};

function viewOf(db: Db, target: GroupingTarget): ReviewAgentsView {
  const names = new Map(listCustomAgents(db, true).map((agent) => [agent.id, agent.name]));
  const runs = latestReviewAgentRuns(db, target.owner).map((run): ReviewAgentRunView => ({
    id: run.id,
    agentId: run.agentId,
    status: run.status,
    output: run.output,
    error: run.error,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    agentName: names.get(run.agentId) ?? `Agent ${run.agentId}`,
    specs: run.specs.filter((spec) => spec.sameAs === undefined).map((spec) => spec.label),
    outdated:
      run.status === 'succeeded' && target.headSha !== null && run.headSha !== target.headSha,
  }));
  const agents = readyReviewAgents(db).map(({ id, name }) => ({ id, name }));
  return { agents, runs, refusal: target.refusal };
}

async function start(readers: SpecReaders, c: Context, target: GroupingTarget): Promise<Response> {
  if (target.refusal !== null) {
    throw fail(CONFLICT, target.refusal);
  }
  const body = await readObject(c.req.raw);
  const agentId = typeof body.agentId === 'number' ? body.agentId : Number.NaN;
  if (!Number.isInteger(agentId) || agentId < 1) {
    throw fail(BAD_REQUEST, 'Give the agent to run as "agentId"');
  }
  const specs = readableSpecs(await readReviewSpecs(readers, target));
  try {
    queueReviewAgentRun(readers.db, target.owner, agentId, specs);
  } catch (error) {
    if (error instanceof ReviewAgentRunError) {
      throw fail(error.reason === 'busy' ? CONFLICT : BAD_REQUEST, error.message);
    }
    throw error;
  }
  return c.json(viewOf(readers.db, target), ACCEPTED);
}

function cancel(db: Db, c: Context, target: GroupingTarget): Response {
  const id = requireId(c.req.param('runId'), 'run id');
  const run = latestReviewAgentRuns(db, target.owner).find((row) => row.id === id);
  if (!run) {
    throw fail(NOT_FOUND, 'No such run on this change');
  }
  if (run.status !== 'queued' && run.status !== 'running') {
    throw fail(CONFLICT, 'The agent is not running on this change');
  }
  db.insert(schema.commands)
    .values({ type: 'cancel_review_agent_run', payload: { runId: run.id } })
    .run();
  return c.json(viewOf(db, target), ACCEPTED);
}

/**
 * Under a review's base (`/api/tickets/:id`, `/api/projects/:projectId/pull-requests/reviews/:number`):
 * `/review-agents` (the agents it can run, each one's newest run), `POST /review-agents` (`{ agentId }`,
 * run on the review's specs, none needed), `/review-agents/:runId/cancel`.
 */
export function reviewAgentRunRoutes(
  readers: SpecReaders,
  targetOf: (c: Context) => GroupingTarget,
): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(viewOf(readers.db, targetOf(c))));
  routes.post('/', (c) => start(readers, c, targetOf(c)));
  routes.post('/:runId/cancel', (c) => cancel(readers.db, c, targetOf(c)));
  return routes;
}
