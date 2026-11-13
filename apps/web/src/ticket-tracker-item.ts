// A ticket's tracker item as the `/trackers/:kind` routes read it: the kind, the item, and the project's integration.
import {
  integrationKind,
  integrationOf,
  isIntegrationKindName,
  type Db,
  type IntegrationKindName,
  type Ticket,
} from '@union/core';
import type { Context } from 'hono';

import { CONFLICT, fail, NOT_FOUND } from './http';
import { loadTicket } from './routes/tickets/ticket-notion-link';

/** The ticket, its item in the tracker `:kind` (the one it came from or was linked to), and the secret to read it. */
export type TicketTrackerItem = {
  ticket: Ticket;
  kind: IntegrationKindName;
  item: { id: string; url: string | null };
  integration: { secret: string; config: unknown };
};

function kindParam(c: Context): IntegrationKindName {
  const kind = c.req.param('kind') ?? '';
  if (!isIntegrationKindName(kind)) {
    throw fail(NOT_FOUND, `Union does not know the tracker "${kind}"`);
  }
  return kind;
}

/** Refused when the ticket has no item of the tracker, or the project is not connected to it any more. */
export function loadTicketTrackerItem(db: Db, c: Context): TicketTrackerItem {
  const ticket = loadTicket(db, c);
  const kind = kindParam(c);
  const { label, itemLabel } = integrationKind(kind);
  if (ticket.originKind !== kind || !ticket.originId) {
    throw fail(CONFLICT, `This ticket is not linked to a ${label} ${itemLabel}`);
  }
  const integration = integrationOf(db, ticket.projectId, kind);
  if (!integration) {
    throw fail(CONFLICT, `The project is not connected to ${label}`);
  }
  return { ticket, kind, item: { id: ticket.originId, url: ticket.originUrl }, integration };
}
