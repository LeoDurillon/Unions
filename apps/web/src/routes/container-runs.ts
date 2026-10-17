import {
  ContainerRunError,
  getContainerRun,
  getTicket,
  keepForAgent,
  listContainerRuns,
  queueContainerRun,
  revisesImplementer,
  schema,
  scriptRun,
  sendToAgent,
  type ContainerRun,
  type Db,
  type ProjectConfig,
  type Ticket,
} from '@union/core';
import { and, eq, isNull } from 'drizzle-orm';
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
  return {
    runs: listContainerRuns(db, { ticketId: ticket.id }),
    refusal: refusal(ticket),
    canSend: revisesImplementer(ticket.phase),
  };
}

/** The ticket's run named in the path. */
function loadRun(db: Db, c: Context, ticket: Ticket): ContainerRun {
  const row = getContainerRun(db, requireId(c.req.param('runId'), 'run id'));
  if (row?.ticketId !== ticket.id) {
    throw fail(NOT_FOUND, 'Run not found');
  }
  return row;
}

/** The rules' refusals are the user's to resolve: they answer 409 with the reason. */
function checked<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw error instanceof ContainerRunError ? fail(CONFLICT, error.message) : error;
  }
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

function projectConfig(db: Db, ticket: Ticket): ProjectConfig {
  const project = db
    .select({ config: schema.projects.config })
    .from(schema.projects)
    .where(eq(schema.projects.id, ticket.projectId))
    .get();
  return project?.config ?? { baseBranch: '' };
}

/** `{ command, timeoutSec? }`, or `{ scriptName }`: a saved script, with its own timeout. */
async function run(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  const body = await readObject(c.req.raw);
  if (typeof body.scriptName === 'string') {
    const name = body.scriptName;
    checked(() => {
      const script = scriptRun(projectConfig(db, ticket), name);
      return queueContainerRun(db, { owner: { ticketId: ticket.id }, ...script });
    });
    return c.json(view(db, ticket), CREATED);
  }
  if (typeof body.command !== 'string') {
    throw fail(BAD_REQUEST, '"command" or "scriptName" must be a string');
  }
  const input = {
    owner: { ticketId: ticket.id },
    command: body.command,
    timeoutSec: timeoutOf(body),
  };
  checked(() => queueContainerRun(db, input));
  return c.json(view(db, ticket), CREATED);
}

function cancel(db: Db, c: Context): Response {
  const ticket = loadTicket(db, c);
  const row = loadRun(db, c, ticket);
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

/** `{ keep }`: the output goes with the implementer's next run, or not. */
async function keep(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  const row = loadRun(db, c, ticket);
  const body = await readObject(c.req.raw);
  if (typeof body.keep !== 'boolean') {
    throw fail(BAD_REQUEST, '"keep" must be true or false');
  }
  checked(() => keepForAgent(db, row.id, body.keep === true));
  return c.json(view(db, ticket));
}

const DEFAULT_NOTE = 'Look at the output of the command I ran, and fix what it shows.';

/** `{ note }`: a revision now, the output with it; the note is the feedback (a default without one). */
async function send(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  const row = loadRun(db, c, ticket);
  const body = await readObject(c.req.raw);
  const note =
    typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim() : DEFAULT_NOTE;
  const pending = db
    .select({ id: schema.commands.id })
    .from(schema.commands)
    .where(and(eq(schema.commands.ticketId, ticket.id), isNull(schema.commands.handledAt)))
    .get();
  if (pending) {
    throw fail(CONFLICT, 'A command for this ticket is still being processed');
  }
  checked(() => sendToAgent(db, row.id, note));
  return c.json(view(db, ticket), ACCEPTED);
}

/**
 * `/api/tickets/:id/container-runs`: commands the user runs in the ticket's workspace (the worker
 * runs them), with the end of their output, which the user can give to the implementer.
 */
export function containerRunRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(view(db, loadTicket(db, c))));
  routes.post('/', (c) => run(db, c));
  routes.post('/:runId/cancel', (c) => cancel(db, c));
  routes.post('/:runId/keep', (c) => keep(db, c));
  routes.post('/:runId/send', (c) => send(db, c));
  return routes;
}
