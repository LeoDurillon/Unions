import { boardStatus, emitEvent, getTicket, schema, type Db, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';

import type { RemoteItem } from './api';
import { stripTicketMarker } from './render';
import { boardStatusFor } from './status';

type Project = typeof schema.projects.$inferSelect;

function setSynced(db: Db, ticketId: number, status: Ticket['githubSyncedStatus']): void {
  db.update(schema.tickets)
    .set({ githubSyncedStatus: status })
    .where(eq(schema.tickets.id, ticketId))
    .run();
}

/** GitHub wins for title and description. */
function pullFields(db: Db, ticket: Ticket, item: RemoteItem): void {
  if (ticket.githubUpdatedAt === item.updatedAt) {
    return;
  }
  const body = stripTicketMarker(item.body);
  const changed = ticket.title !== item.title || ticket.body !== body;
  db.update(schema.tickets)
    .set({ title: item.title, body, githubUpdatedAt: item.updatedAt })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  if (changed) {
    emitEvent(db, { type: 'ticket_updated_from_github', ticketId: ticket.id, payload: {} });
  }
}

/** Only "move to In Progress" is honoured from GitHub; any other remote move is reverted. */
function pullStatus(db: Db, project: Project, ticket: Ticket, item: RemoteItem): void {
  const remote = boardStatusFor(project.config.statusOptions, item.status);
  if (remote === null || remote === ticket.githubSyncedStatus) {
    return;
  }
  if (remote === 'in_progress' && ticket.phase.kind === 'backlog') {
    db.insert(schema.commands).values({ type: 'start', ticketId: ticket.id }).run();
    setSynced(db, ticket.id, remote);
    return;
  }
  emitEvent(db, {
    type: 'github_status_reverted',
    ticketId: ticket.id,
    payload: { remote, local: boardStatus(ticket.phase) },
  });
  setSynced(db, ticket.id, null);
}

export function applyRemoteItem(db: Db, project: Project, ticket: Ticket, item: RemoteItem): void {
  pullFields(db, ticket, item);
  pullStatus(db, project, getTicket(db, ticket.id), item);
}
