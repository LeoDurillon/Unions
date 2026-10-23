import {
  discardPrDescription,
  getPrDescription,
  getTicket,
  latestPrDescription,
  PrDescriptionError,
  prDescriptionOutdated,
  queuePrDescription,
  schema,
  startSendingPrDescription,
  withoutUnionLinks,
  type Db,
  type PrDescription,
  type Ticket,
} from '@union/core';
import { Hono, type Context } from 'hono';

import type { PrDescriptionDraft, PrDescriptionView } from '../api-types';
import { ACCEPTED, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';
import { pickedPullRequest } from '../ticket-pull-request';

function loadTicket(db: Db, c: Context): Ticket {
  const id = requireId(c.req.param('id'), 'ticket id');
  try {
    return getTicket(db, id);
  } catch {
    throw fail(NOT_FOUND, 'Ticket not found');
  }
}

/** The ticket's draft named in the path. */
function loadDraft(db: Db, c: Context, ticket: Ticket): PrDescription {
  const row = getPrDescription(db, requireId(c.req.param('draftId'), 'description id'));
  if (row?.ticketId !== ticket.id) {
    throw fail(NOT_FOUND, 'Description not found');
  }
  return row;
}

/** Record errors are the user's to resolve: they answer 409 with the reason. */
function checked<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof PrDescriptionError) {
      throw fail(CONFLICT, error.message);
    }
    throw error;
  }
}

/** Why the agent cannot rewrite the description now; null when it can. */
function refusal(ticket: Ticket): string | null {
  if (ticket.prNumber === null) {
    return 'The ticket has no pull request.';
  }
  if (ticket.prState === 'merged' || ticket.prState === 'closed') {
    return `The pull request is ${ticket.prState}.`;
  }
  return ticket.phase.kind === 'running'
    ? 'Wait for the current run to finish: the agent writes in the same workspace.'
    : null;
}

function draftOf(row: PrDescription): PrDescriptionDraft {
  return {
    id: row.id,
    status: row.status,
    original: row.original === null ? null : withoutUnionLinks(row.original),
    text: row.text,
    error: row.error,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
    sentAt: row.sentAt,
  };
}

/** `prNumber`: the ticket's pull request or one of its slices'; its latest draft is the one shown. */
function view(db: Db, ticket: Ticket, prNumber: number | null): PrDescriptionView {
  const row = prNumber === null ? null : latestPrDescription(db, ticket.id, prNumber);
  return {
    draft: row ? draftOf(row) : null,
    outdated: ticket.prNumber !== null && prDescriptionOutdated(db, ticket.id),
    refusal: refusal(ticket),
  };
}

function command(db: Db, ticket: Ticket, type: string, row: PrDescription): void {
  db.insert(schema.commands)
    .values({ type, ticketId: ticket.id, payload: { prDescriptionId: row.id } })
    .run();
}

async function send(db: Db, c: Context): Promise<Response> {
  const ticket = loadTicket(db, c);
  const row = loadDraft(db, c, ticket);
  const body = await readObject(c.req.raw);
  const text = typeof body.text === 'string' ? body.text : '';
  const sending = checked(() => startSendingPrDescription(db, row.id, text));
  command(db, ticket, 'update_pr_description', sending);
  return c.json(view(db, ticket, row.prNumber), ACCEPTED);
}

/**
 * `/api/tickets/:id/pr-description`: the agent rewrites the PR's description (each open slice's, for
 * a split ticket) into drafts the user edits; sending one is a command (the worker writes to
 * GitHub). `?pr=` picks the slice whose draft is shown.
 */
export function prDescriptionRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => {
    const ticket = loadTicket(db, c);
    const picked = ticket.prNumber === null ? null : pickedPullRequest(db, ticket, c);
    return c.json(view(db, ticket, picked));
  });
  routes.post('/', (c) => {
    const ticket = loadTicket(db, c);
    const reason = refusal(ticket);
    if (reason !== null) {
      throw fail(CONFLICT, reason);
    }
    const picked = pickedPullRequest(db, ticket, c);
    checked(() => queuePrDescription(db, ticket.id));
    return c.json(view(db, ticket, picked), ACCEPTED);
  });
  routes.post('/:draftId/send', (c) => send(db, c));
  routes.post('/:draftId/discard', (c) => {
    const ticket = loadTicket(db, c);
    const row = loadDraft(db, c, ticket);
    checked(() => {
      discardPrDescription(db, row.id);
    });
    return c.json(view(db, ticket, row.prNumber));
  });
  routes.post('/:draftId/cancel', (c) => {
    const ticket = loadTicket(db, c);
    const row = loadDraft(db, c, ticket);
    if (row.status !== 'queued' && row.status !== 'running') {
      throw fail(CONFLICT, 'The agent is not rewriting the description');
    }
    command(db, ticket, 'cancel_pr_description', row);
    return c.json(view(db, ticket, row.prNumber), ACCEPTED);
  });
  return routes;
}
