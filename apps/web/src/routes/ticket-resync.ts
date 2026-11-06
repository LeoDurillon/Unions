// The API route that asks the worker to reset a ticket's workspace onto its branch as GitHub has it, after it moved there.
import { listSlices, resyncRefusal, schema, type Db } from '@union/core';
import { Hono, type Context } from 'hono';

import { ACCEPTED, CONFLICT, fail } from '../http';
import { load } from './ticket-base';
import { hasPendingCommand } from './ticket-command-checks';

/**
 * `POST /api/tickets/:id/resync`: queues `resync_branch` when the branch moved on GitHub and no
 * step works on it. The worker fetches it, checks the workspace holds nothing unpushed, and resets.
 */
function resync(db: Db, c: Context): Response {
  const { ticket } = load(db, c);
  const refused = resyncRefusal(ticket, listSlices(db, ticket.id).length > 0);
  if (refused) {
    throw fail(CONFLICT, refused);
  }
  if (hasPendingCommand(db, ticket.id)) {
    throw fail(CONFLICT, 'A command for this ticket is still being processed');
  }
  const command = db
    .insert(schema.commands)
    .values({ type: 'resync_branch', ticketId: ticket.id, payload: null })
    .returning()
    .get();
  return c.json(command, ACCEPTED);
}

export function ticketResyncRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.post('/:id/resync', (c) => resync(db, c));
  return routes;
}
