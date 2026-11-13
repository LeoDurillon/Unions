// The ticket a `/api/tickets/:id/…` route names: 404 when there is none.

import type { Db, Ticket } from '@union/core';
import type { Context } from 'hono';

import { NOT_FOUND, fail, requireId } from '../../http';
import { findTicket } from './ticket-links';

export function loadTicket(db: Db, c: Context): Ticket {
  const id = requireId(c.req.param('id'), 'ticket id');
  const ticket = findTicket(db)(id);
  if (!ticket) {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
  return ticket;
}
