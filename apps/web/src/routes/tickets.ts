// The API routes for tickets: listing, creating, editing outputs and moving them between steps.
import {
  InvalidTransition,
  isCustomStep,
  latestOutput,
  latestRefusal,
  saveOutput,
  schema,
  STEPS,
  transition,
  type Db,
  type Step,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { COMMAND_TYPES, type CommandType, type TicketSummary } from '../api-types';
import {
  ACCEPTED,
  BAD_REQUEST,
  CONFLICT,
  CREATED,
  fail,
  readObject,
  requireId,
  requireText,
} from '../http';
import type { ApiServices } from '../services';
import { assertCommandFits, hasPendingCommand } from './ticket-command-checks';
import { loadTicket, ticketDetail } from './ticket-detail';
import { changeParent, summarizeWithStack } from './ticket-links';
import { ticketOutsideLinkRoutes } from './ticket-outside-links';
import { ticketSubroutes } from './ticket-subroutes';

function isCommandType(value: unknown): value is CommandType {
  return COMMAND_TYPES.some((type) => type === value);
}

function isStep(value: string): value is Step {
  return isCustomStep(value) || STEPS.some((step) => step === value);
}

function listTickets(db: Db, c: Context): Response {
  const projectId = c.req.query('projectId');
  const rows = db.select().from(schema.tickets).all();
  const filtered = projectId ? rows.filter((row) => row.projectId === Number(projectId)) : rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return c.json(filtered.map((row) => summarizeWithStack(db, row, (id) => byId.get(id))));
}

function assertAllowed(ticket: TicketSummary, type: CommandType): void {
  try {
    transition(ticket.phase, { type });
  } catch (error) {
    throw error instanceof InvalidTransition ? fail(CONFLICT, error.message) : error;
  }
}

/**
 * The command's payload. A decision on a refused commit names the refusal the user saw: a newer one
 * (the changes moved) must be looked at first.
 */
function commandPayload(
  db: Db,
  ticketId: number,
  type: CommandType,
  body: Record<string, unknown>,
): Record<string, unknown> | null {
  if (type === 'revise') {
    return { feedback: requireText(body, 'feedback') };
  }
  if (type !== 'commit_anyway' && type !== 'drop_leftovers') {
    return null;
  }
  const refusal = latestRefusal(db, ticketId);
  if (!refusal || refusal.id !== body.refusalId || refusal.resolvedAt !== null) {
    throw fail(
      CONFLICT,
      'The refused changes are not the ones shown: reload them and decide again',
    );
  }
  return type === 'commit_anyway' ? { message: requireText(body, 'message') } : {};
}

async function queueCommand(db: Db, c: Context): Promise<Response> {
  const id = requireId(c.req.param('id'), 'ticket id');
  const ticket = loadTicket(db, id);
  const body = await readObject(c.req.raw);
  const { type } = body;
  if (!isCommandType(type)) {
    throw fail(BAD_REQUEST, `"type" must be one of ${COMMAND_TYPES.join(', ')}`);
  }
  assertAllowed(ticket, type);
  const payload = commandPayload(db, id, type, body);
  assertCommandFits(db, ticket, type);
  if (hasPendingCommand(db, id)) {
    throw fail(CONFLICT, 'A command for this ticket is still being processed');
  }
  const command = db
    .insert(schema.commands)
    .values({ type, ticketId: id, payload })
    .returning()
    .get();
  return c.json(command, ACCEPTED);
}

/** The user edits the latest output (for example to answer intake questions) before approving. */
async function editOutput(db: Db, c: Context): Promise<Response> {
  const id = requireId(c.req.param('id'), 'ticket id');
  const step = c.req.param('step') ?? '';
  const { phase } = loadTicket(db, id);
  if (!isStep(step)) {
    throw fail(BAD_REQUEST, `Unknown step "${step}"`);
  }
  if (phase.kind !== 'awaiting_approval' || phase.step !== step) {
    throw fail(CONFLICT, `Step ${step} is not awaiting approval`);
  }
  const content = requireText(await readObject(c.req.raw), 'content');
  if (latestOutput(db, id, step)?.content === content) {
    throw fail(CONFLICT, 'Content is unchanged');
  }
  return c.json(saveOutput(db, id, step, content), CREATED);
}

export function ticketRoutes(db: Db, services: ApiServices): Hono {
  const routes = new Hono();
  routes.get('/', (c) => listTickets(db, c));
  routes.get('/:id', (c) => ticketDetail(db, c));
  routes.post('/:id/commands', (c) => queueCommand(db, c));
  routes.put('/:id/steps/:step/output', (c) => editOutput(db, c));
  routes.put('/:id/parent', (c) => changeParent(db, c));
  routes.route('/', ticketOutsideLinkRoutes(db, services));
  routes.route('/', ticketSubroutes(db, services));
  return routes;
}
