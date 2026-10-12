import { eq } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './schema';
import { emitEvent, getTicket, ticketLabel, type Project, type Ticket } from './tickets';

/** A parent link the rules refuse: wrong project, a cycle, or a ticket that already started. */
export class TicketLinkError extends Error {}

function isAncestor(db: Db, candidate: number, of: Ticket): boolean {
  const seen = new Set<number>();
  let current = of.parentTicketId;
  while (current !== null && !seen.has(current)) {
    if (current === candidate) {
      return true;
    }
    seen.add(current);
    current = getTicket(db, current).parentTicketId;
  }
  return false;
}

function checkParent(db: Db, ticket: Ticket, parentId: number): void {
  if (parentId === ticket.id) {
    throw new TicketLinkError('A ticket cannot depend on itself');
  }
  const parent = db.select().from(schema.tickets).where(eq(schema.tickets.id, parentId)).get();
  if (!parent || parent.projectId !== ticket.projectId) {
    throw new TicketLinkError('The parent must be a ticket of the same project');
  }
  if (isAncestor(db, ticket.id, parent)) {
    throw new TicketLinkError(`${ticketLabel(parent)} already depends on this ticket`);
  }
}

/**
 * Links the ticket to the ticket it builds on (or unlinks it with null). Only before it starts:
 * the parent decides which branch the ticket is cloned from.
 */
export function setParent(db: Db, ticketId: number, parentId: number | null): Ticket {
  const ticket = getTicket(db, ticketId);
  if (ticket.phase.kind !== 'backlog') {
    throw new TicketLinkError('The parent can only change before the ticket starts');
  }
  if (parentId !== null) {
    checkParent(db, ticket, parentId);
  }
  return db.transaction((tx) => {
    const updated = tx
      .update(schema.tickets)
      .set({ parentTicketId: parentId })
      .where(eq(schema.tickets.id, ticketId))
      .returning()
      .get();
    emitEvent(tx, { type: 'ticket_parent_changed', ticketId, payload: { parentId } });
    return updated;
  });
}

/** The ticket this one builds on, if any. */
export function parentOf(db: Db, ticket: Ticket): Ticket | null {
  return ticket.parentTicketId === null ? null : getTicket(db, ticket.parentTicketId);
}

/** The branch the ticket starts from and is compared with: its parent's, else the project's. */
export function ticketBase(project: Project, ticket: Ticket): string {
  return ticket.baseBranch ?? project.config.baseBranch;
}
