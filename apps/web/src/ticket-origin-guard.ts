// A ticket comes from one tracker at most: linking it to another one's item, or unlinking another one's, is refused.
import { integrationKind, type IntegrationKindName, type Ticket } from '@union/core';

import { CONFLICT, fail } from './http';

/** Throws when the ticket already comes from another tracker than `kind`. */
export function requireFreeOrigin(ticket: Ticket, kind: IntegrationKindName): void {
  if (ticket.originKind !== null && ticket.originKind !== kind) {
    const { label, itemLabel } = integrationKind(ticket.originKind);
    throw fail(CONFLICT, `This ticket comes from ${label}: unlink its ${label} ${itemLabel} first`);
  }
}

/** Throws when the ticket is not linked to an item of `kind` (unlinking it would drop another tracker's). */
export function requireOrigin(ticket: Ticket, kind: IntegrationKindName): void {
  if (ticket.originKind !== kind) {
    const { label, itemLabel } = integrationKind(kind);
    throw fail(CONFLICT, `This ticket is not linked to a ${label} ${itemLabel}`);
  }
}
