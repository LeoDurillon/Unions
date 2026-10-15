import {
  ContainerRunError,
  getContainerRun,
  getTicket,
  listContainerRuns,
  queueContainerRun,
  schema,
  type Db,
  type Ticket,
} from '@union/core';
import { Hono, type Context } from 'hono';

import type { ContainerRunsView } from '../api-types';
import {
  ACCEPTED,
  BAD_REQUEST,
  CONFLICT,
  CREATED,
  fail,
  NOT_FOUND,
  readObject,
  requireId,
} from '../http';

function loadTicket(db: Db, c: Context): Ticket {
  const id = requireId(c.req.param('id'), 'ticket id');
  try {
    return getTicket(db, id);
  } catch {
    throw fail(NOT_FOUND, 'Ticket not found');
  }
}

/** Why no command can run in the workspace now; null when one can. */
function refusal(ticket: Ticket): string | null {
  if (ticket.phase.kind === 'running') {
    return 'A step is running in this workspace';
  }
  return ticket.phase.kind === 'cancelled' ? 'The ticket is cancelled' : null;
}

function view(db: Db, ticket: Ticket): ContainerRunsView {
  return { runs: listContainerRuns(db, ticket.id), refusal: refusal(ticket) };
}

function timeoutOf(body: Record<string, unknown>): number | undefined {
  const { timeoutSec } = body;
  if (timeoutSec === undefined || timeoutSec === null) {
    return undefined;
  }
  if (typeof timeoutSec !== 'number') {
    throw fail(BAD_REQUEST, '"timeoutSec" must be a number of seconds');
  }
  return timeoutSec;
}

async function run(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  const body = await readObject(c.req.raw);
  if (typeof body.command !== 'string') {
    throw fail(BAD_REQUEST, '"command" must be a string');
  }
  try {
    queueContainerRun(db, {
      ticketId: ticket.id,
      command: body.command,
      timeoutSec: timeoutOf(body),
    });
  } catch (error) {
    throw error instanceof ContainerRunError ? fail(CONFLICT, error.message) : error;
  }
  return c.json(view(db, ticket), CREATED);
}

function cancel(db: Db, c: Context): Response {
  const ticket = loadTicket(db, c);
  const row = getContainerRun(db, requireId(c.req.param('runId'), 'run id'));
  if (row?.ticketId !== ticket.id) {
    throw fail(NOT_FOUND, 'Run not found');
  }
  if (row.status !== 'queued' && row.status !== 'running') {
    throw fail(CONFLICT, 'The command is not running');
  }
  db.insert(schema.commands)
    .values({
      type: 'cancel_container_run',
      ticketId: ticket.id,
      payload: { containerRunId: row.id },
    })
    .run();
  return c.json(view(db, ticket), ACCEPTED);
}

/**
 * `/api/tickets/:id/container-runs`: commands the user runs in the ticket's workspace (the worker
 * runs them), with the end of their output.
 */
export function containerRunRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(view(db, loadTicket(db, c))));
  routes.post('/', (c) => run(db, c));
  routes.post('/:runId/cancel', (c) => cancel(db, c));
  return routes;
}
