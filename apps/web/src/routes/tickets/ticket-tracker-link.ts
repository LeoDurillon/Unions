// `/api/tickets/:id/trackers/:kind/link`: links a ticket to a tracker item after creation, or unlinks it.
// The tracker is only read: `POST /check` reads the item a pasted key or link names, `PUT` links it, `DELETE` unlinks it.

import {
  integrationKind,
  integrationOf,
  setTicketOrigin,
  trackerAdapter,
  type Db,
  type IntegrationApis,
  type LinkedItem,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { BAD_REQUEST, CONFLICT, fail, readObject, requireText } from '../../http';
import { requireFreeOrigin, requireOrigin } from '../../ticket-origin-guard';
import { kindParam } from '../../ticket-tracker-item';
import { guarded } from '../tracker-errors';
import { loadTicket } from './ticket-load';

/** The item `{ item }` names, read with the project's credentials. */
async function readItem(db: Db, apis: IntegrationApis, c: Context): Promise<LinkedItem> {
  const ticket = loadTicket(db, c);
  const kind = kindParam(c);
  const { label, itemLabel } = integrationKind(kind);
  const ref = requireText(await readObject(c.req.raw), 'item');
  const integration = integrationOf(db, ticket.projectId, kind);
  const { refs } = trackerAdapter(kind, apis);
  if (!integration || !refs) {
    throw fail(CONFLICT, `The project is not connected to ${label}`);
  }
  const itemId = refs.parse(ref);
  if (!itemId) {
    throw fail(BAD_REQUEST, `That is not a ${label} ${itemLabel} link or ID`);
  }
  const elsewhere = refs.error(ref, integration.config);
  if (elsewhere !== null) {
    throw fail(BAD_REQUEST, elsewhere);
  }
  return guarded(() => refs.check(integration.secret, integration.config, itemId));
}

/** The item becomes the ticket's origin, as if imported from it; its description is kept as written. */
async function link(db: Db, apis: IntegrationApis, c: Context): Promise<Response> {
  const kind = kindParam(c);
  requireFreeOrigin(loadTicket(db, c), kind);
  const found = await readItem(db, apis, c);
  setTicketOrigin(db, loadTicket(db, c).id, { kind, id: found.itemId, url: found.url });
  return c.json(found);
}

/** Forgets the link; the item itself is left untouched in its tracker. */
function unlink(db: Db, c: Context): Response {
  const ticket = loadTicket(db, c);
  requireOrigin(ticket, kindParam(c));
  setTicketOrigin(db, ticket.id, null);
  return c.json({ ok: true });
}

export function ticketTrackerLinkRoutes(db: Db, apis: IntegrationApis): Hono {
  const routes = new Hono();
  routes.post('/:id/trackers/:kind/link/check', async (c) => c.json(await readItem(db, apis, c)));
  routes.put('/:id/trackers/:kind/link', (c) => link(db, apis, c));
  routes.delete('/:id/trackers/:kind/link', (c) => unlink(db, c));
  return routes;
}
