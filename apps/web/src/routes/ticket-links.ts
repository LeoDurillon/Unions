import {
  blockingParent,
  boardColumn,
  getTicket,
  schema,
  setParent,
  StartBlocked,
  TicketLinkError,
  type Db,
  type Ticket,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

import type { TicketRef, TicketSummary } from '../api-types';
import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';
import { stackView } from './ticket-stack';

export function ticketRef(ticket: Ticket): TicketRef {
  return {
    id: ticket.id,
    title: ticket.title,
    issueNumber: ticket.issueNumber,
    done: ticket.phase.kind === 'done',
  };
}

/** `find` resolves the parent: a map over a listing, or a lookup in the database. */
export function summarize(ticket: Ticket, find: (id: number) => Ticket | undefined): TicketSummary {
  const parent = ticket.parentTicketId === null ? undefined : find(ticket.parentTicketId);
  return { ...ticket, board: boardColumn(ticket), parent: parent ? ticketRef(parent) : null };
}

/** The summary with the ticket's stack, for the board and the ticket's panel. */
export function summarizeWithStack(
  db: Db,
  ticket: Ticket,
  find: (id: number) => Ticket | undefined,
): TicketSummary {
  return { ...summarize(ticket, find), stack: stackView(db, ticket) };
}

export function findTicket(db: Db): (id: number) => Ticket | undefined {
  return (id) => db.select().from(schema.tickets).where(eq(schema.tickets.id, id)).get();
}

export function childrenOf(db: Db, id: number): TicketRef[] {
  return db
    .select()
    .from(schema.tickets)
    .where(eq(schema.tickets.parentTicketId, id))
    .all()
    .map((child) => ticketRef(child));
}

/** Answers 409 before a start command is queued for a ticket whose parent is not done. */
export function assertStartable(db: Db, ticket: Ticket): void {
  const parent = blockingParent(db, ticket);
  if (parent) {
    throw fail(CONFLICT, new StartBlocked(parent).message);
  }
}

function parentIdOf(body: Record<string, unknown>): number | null {
  const { parentId } = body;
  if (parentId === null) {
    return null;
  }
  if (typeof parentId !== 'number' || !Number.isInteger(parentId)) {
    throw fail(BAD_REQUEST, '"parentId" must be a ticket id or null');
  }
  return parentId;
}

/** Applies a parent link with the core rules, mapped to HTTP errors. */
export function linkParent(db: Db, ticketId: number, parentId: number | null): Ticket {
  try {
    return setParent(db, ticketId, parentId);
  } catch (error) {
    throw error instanceof TicketLinkError ? fail(CONFLICT, error.message) : error;
  }
}

/** `PUT /api/tickets/:id/parent` with `{ parentId }`; null unlinks. */
export async function changeParent(db: Db, c: Context): Promise<Response> {
  const id = requireId(c.req.param('id'), 'ticket id');
  if (!findTicket(db)(id)) {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
  const parentId = parentIdOf(await readObject(c.req.raw));
  const ticket = linkParent(db, id, parentId);
  return c.json(summarize(ticket, (other) => getTicket(db, other)));
}
