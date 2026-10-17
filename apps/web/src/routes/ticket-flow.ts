// The steps a ticket runs: read from a request, and `PUT /api/tickets/:id/flow` while it is in Backlog.
import {
  chooseFlow,
  flowProblems,
  FlowChangeRefused,
  type Db,
  type PipelineStep,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';
import { findTicket, summarize } from './ticket-links';

/** `flow` of a request: absent (undefined), the project's default (null), or a valid flow. */
export function flowOf(body: Record<string, unknown>): PipelineStep[] | null | undefined {
  const { flow } = body;
  if (flow === undefined || flow === null) {
    return flow;
  }
  const problems = flowProblems(flow);
  if (problems.length > 0 || !Array.isArray(flow)) {
    throw fail(BAD_REQUEST, problems.join('; '));
  }
  return flow.filter((step): step is PipelineStep => typeof step === 'string');
}

/** `PUT /api/tickets/:id/flow` with `{ flow }`: refused once the ticket started. */
async function putFlow(db: Db, c: Context): Promise<Response> {
  const id = requireId(c.req.param('id'), 'ticket id');
  if (!findTicket(db)(id)) {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
  const flow = flowOf(await readObject(c.req.raw));
  if (flow === undefined) {
    throw fail(BAD_REQUEST, 'Give "flow": a list of steps, or null for the project default');
  }
  try {
    return c.json(summarize(chooseFlow(db, id, flow), findTicket(db)));
  } catch (error) {
    throw error instanceof FlowChangeRefused ? fail(CONFLICT, error.message) : error;
  }
}

export function ticketFlowRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.put('/:id/flow', (c) => putFlow(db, c));
  return routes;
}
