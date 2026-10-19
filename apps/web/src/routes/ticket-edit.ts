// `PUT /api/tickets/:id/text`: the user's new title and description, queued for the worker, which writes them to the issue.
import { isRecord, schema, type Db } from '@union/core';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { ACCEPTED, BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject, requireId } from '../http';
import { findTicket } from './ticket-links';

type TicketText = { title: string; body: string };

function textOf(value: unknown, missing: string): TicketText {
  if (!isRecord(value) || typeof value.title !== 'string' || typeof value.body !== 'string') {
    throw fail(BAD_REQUEST, missing);
  }
  return { title: value.title, body: value.body };
}

function editPending(db: Db, ticketId: number): boolean {
  const row = db
    .select({ id: schema.commands.id })
    .from(schema.commands)
    .where(
      and(
        eq(schema.commands.ticketId, ticketId),
        eq(schema.commands.type, 'edit_ticket'),
        isNull(schema.commands.handledAt),
      ),
    )
    .get();
  return row !== undefined;
}

/**
 * `{ title, body, base }`, `base` being the text the user started from: refused when the ticket
 * changed since (GitHub's version came in), so nothing is overwritten unseen.
 */
async function putText(db: Db, c: Context): Promise<Response> {
  const id = requireId(c.req.param('id'), 'ticket id');
  const ticket = findTicket(db)(id);
  if (!ticket) {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
  const request = await readObject(c.req.raw);
  const edited = textOf(request, 'Give "title" and "body"');
  const text = { title: edited.title.trim(), body: edited.body };
  if (text.title === '') {
    throw fail(BAD_REQUEST, 'The title cannot be empty');
  }
  const base = textOf(request.base, 'Give "base": the title and body the edit started from');
  if (base.title !== ticket.title || base.body !== ticket.body) {
    throw fail(CONFLICT, 'The ticket changed since you opened it: reload it and edit again');
  }
  if (editPending(db, id)) {
    throw fail(CONFLICT, 'An edit of this ticket is already being saved');
  }
  db.insert(schema.commands)
    .values({ type: 'edit_ticket', ticketId: id, payload: { ...text, base } })
    .run();
  return c.json({ queued: true }, ACCEPTED);
}

export function ticketEditRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.put('/:id/text', (c) => putText(db, c));
  return routes;
}
