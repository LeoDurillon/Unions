// The API routes for tickets: listing, creating, editing outputs and moving them between steps.
import {
  describeTicketBase,
  getTicket,
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
import { and, eq, isNull } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import {
  COMMAND_TYPES,
  toPublicProject,
  type CommandType,
  type TicketDetail,
  type TicketSummary,
} from '../api-types';
import {
  ACCEPTED,
  BAD_REQUEST,
  CONFLICT,
  CREATED,
  fail,
  NOT_FOUND,
  readObject,
  requireId,
  requireText,
} from '../http';
import type { ApiServices } from '../services';
import { reviewRoutes } from './review';
import { assertStartable, changeParent, childrenOf, findTicket, summarize } from './ticket-links';
import { linkPullRequest, unlinkPullRequest } from './ticket-pull-request';
import { ticketSubroutes } from './ticket-subroutes';

function loadTicket(db: Db, id: number): TicketSummary {
  try {
    return summarize(getTicket(db, id), findTicket(db));
  } catch {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
}

function isCommandType(value: unknown): value is CommandType {
  return COMMAND_TYPES.some((type) => type === value);
}

function isStep(value: string): value is Step {
  return isCustomStep(value) || STEPS.some((step) => step === value);
}

function hasPendingCommand(db: Db, ticketId: number): boolean {
  const pending = db
    .select()
    .from(schema.commands)
    .where(and(eq(schema.commands.ticketId, ticketId), isNull(schema.commands.handledAt)))
    .get();
  return pending !== undefined;
}

function listTickets(db: Db, c: Context): Response {
  const projectId = c.req.query('projectId');
  const rows = db.select().from(schema.tickets).all();
  const filtered = projectId ? rows.filter((row) => row.projectId === Number(projectId)) : rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return c.json(filtered.map((row) => summarize(row, (id) => byId.get(id))));
}

function ticketDetail(db: Db, c: Context): Response {
  const id = requireId(c.req.param('id'), 'ticket id');
  const ticket = loadTicket(db, id);
  const project = db
    .select()
    .from(schema.projects)
    .all()
    .find((row) => row.id === ticket.projectId);
  if (!project) {
    throw fail(NOT_FOUND, 'Project not found');
  }
  const parent = ticket.parentTicketId === null ? null : findTicket(db)(ticket.parentTicketId);
  const detail: TicketDetail = {
    ticket,
    project: toPublicProject(project),
    children: childrenOf(db, id),
    base: describeTicketBase(ticket, parent ?? null, project.config.baseBranch),
    outputs: db
      .select()
      .from(schema.stepOutputs)
      .where(eq(schema.stepOutputs.ticketId, id))
      .orderBy(schema.stepOutputs.version)
      .all(),
    runs: db.select().from(schema.runs).where(eq(schema.runs.ticketId, id)).all(),
  };
  return c.json(detail);
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
  if (type === 'start') {
    assertStartable(db, ticket);
  }
  // The worker knows the PR is open (and how far behind it is) from GitHub: no count, no rebase.
  if (type === 'rebase' && (ticket.branch === null || ticket.behindBy === null)) {
    throw fail(
      CONFLICT,
      'Nothing to rebase: the ticket has no open pull request (or it was not checked yet)',
    );
  }
  if (type === 'simplify' && (ticket.branch === null || ticket.prState !== 'open')) {
    throw fail(CONFLICT, 'Nothing to simplify: the ticket has no open pull request');
  }
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
  const { github } = services;
  const routes = new Hono();
  routes.get('/', (c) => listTickets(db, c));
  routes.get('/:id', (c) => ticketDetail(db, c));
  routes.post('/:id/commands', (c) => queueCommand(db, c));
  routes.put('/:id/steps/:step/output', (c) => editOutput(db, c));
  routes.put('/:id/parent', (c) => changeParent(db, c));
  routes.put('/:id/pull-request', (c) => linkPullRequest(db, github, c));
  routes.delete('/:id/pull-request', (c) => unlinkPullRequest(db, c));
  routes.route('/', ticketSubroutes(db, services));
  routes.route('/', reviewRoutes(db, github));
  return routes;
}
