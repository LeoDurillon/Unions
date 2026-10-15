import { asc, eq } from 'drizzle-orm';

import type { Db } from './db';
import { getInvestigation, InvestigationError, type Investigation } from './investigations';
import * as schema from './schema';
import { setParent } from './ticket-links';
import { createTicket, emitEvent } from './tickets';

/**
 * Asks for a ticket written from an answered investigation, with what the user wants it to cover.
 * The worker drafts it (`claimTicketDraft`), then creates it in the backlog.
 */
export function requestTicket(db: Db, id: number, context: string): Investigation {
  const current = getInvestigation(db, id);
  if (current.status !== 'succeeded' || current.result === null) {
    throw new InvestigationError('Only an answered investigation can become a ticket');
  }
  if (current.ticketStatus === 'queued' || current.ticketStatus === 'running') {
    throw new InvestigationError('A ticket is already being written from this investigation');
  }
  return db.transaction((tx) => {
    const row = tx
      .update(schema.investigations)
      .set({ ticketStatus: 'queued', ticketContext: context.trim(), ticketError: null })
      .where(eq(schema.investigations.id, id))
      .returning()
      .get();
    emitEvent(tx, { type: 'investigation_ticket_queued', investigationId: id, payload: {} });
    return row;
  });
}

/** Marks the oldest asked ticket as being written and returns its investigation; null when none waits. */
export function claimTicketDraft(db: Db): Investigation | null {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(schema.investigations)
      .where(eq(schema.investigations.ticketStatus, 'queued'))
      .orderBy(asc(schema.investigations.id))
      .get();
    if (!next) {
      return null;
    }
    const row = tx
      .update(schema.investigations)
      .set({ ticketStatus: 'running' })
      .where(eq(schema.investigations.id, next.id))
      .returning()
      .get();
    emitEvent(tx, { type: 'investigation_ticket_started', investigationId: row.id, payload: {} });
    return row;
  });
}

export type TicketDraft = { title: string; body: string };

/** Creates the drafted ticket in the backlog and links it to the investigation; or records the failure. */
/**
 * A ticket written from an investigation on a ticket builds on that ticket: it depends on it, so it
 * starts once that one is done, from its branch. Not on a cancelled one (it would never start), nor
 * a removed one.
 */
function linkToInvestigated(db: Db, investigation: Investigation, ticketId: number): void {
  if (investigation.scope !== 'ticket' || investigation.onTicketId === null) {
    return;
  }
  const investigated = db
    .select()
    .from(schema.tickets)
    .where(eq(schema.tickets.id, investigation.onTicketId))
    .get();
  if (investigated && investigated.phase.kind !== 'cancelled') {
    setParent(db, ticketId, investigated.id);
  }
}

export function finishTicketDraft(
  db: Db,
  id: number,
  outcome: { draft: TicketDraft } | { error: string },
): void {
  const investigation = db
    .select()
    .from(schema.investigations)
    .where(eq(schema.investigations.id, id))
    .get();
  if (!investigation) {
    return;
  }
  const ticketId =
    'draft' in outcome
      ? createTicket(db, { projectId: investigation.projectId, ...outcome.draft }).id
      : null;
  if (ticketId !== null) {
    linkToInvestigated(db, investigation, ticketId);
  }
  db.transaction((tx) => {
    tx.update(schema.investigations)
      .set(
        ticketId === null
          ? { ticketStatus: 'failed', ticketError: 'error' in outcome ? outcome.error : null }
          : { ticketStatus: null, ticketError: null, ticketId },
      )
      .where(eq(schema.investigations.id, id))
      .run();
    emitEvent(
      tx,
      ticketId === null
        ? {
            type: 'investigation_ticket_failed',
            investigationId: id,
            payload: { error: 'error' in outcome ? outcome.error : '' },
          }
        : { type: 'investigation_ticket_created', investigationId: id, payload: { ticketId } },
    );
  });
}

/** Ticket drafts left `running` by a worker that stopped mid-way fail; returns their investigations. */
export function failInterruptedTicketDrafts(db: Db): number[] {
  const stuck = db
    .select()
    .from(schema.investigations)
    .where(eq(schema.investigations.ticketStatus, 'running'))
    .all();
  for (const row of stuck) {
    finishTicketDraft(db, row.id, { error: 'The worker stopped while writing the ticket' });
  }
  return stuck.map((row) => row.id);
}
