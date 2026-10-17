// `/api/tickets/:id/usage`: what the ticket's agent calls used, per run, written by the worker as each call ends.
import { schema, usageOf, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

import { NOT_FOUND, fail, requireId } from '../http';

export function ticketUsage(db: Db, c: Context): Response {
  const ticketId = requireId(c.req.param('id'), 'ticket id');
  const ticket = db
    .select({ id: schema.tickets.id })
    .from(schema.tickets)
    .where(eq(schema.tickets.id, ticketId))
    .get();
  if (!ticket) {
    throw fail(NOT_FOUND, 'Ticket not found');
  }
  return c.json(usageOf(db, { ticketId }));
}
