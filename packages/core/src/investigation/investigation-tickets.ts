// Asks for a ticket written from an answered investigation, with what the user wants it to cover.

import { asc, eq } from 'drizzle-orm';

import type { Db } from '../db';
import { jiraAuthOf } from '../integrations/jira-integration';
import { integrationKind, type IntegrationKindName } from '../integrations/kinds';
import { notionAccessOf } from '../integrations/notion-integration';
import * as schema from '../schema/schema';
import { setParent } from '../ticket/ticket-links';
import { createTicket, emitEvent, type TicketOrigin } from '../ticket/tickets';
import { getInvestigation, InvestigationError, type Investigation } from './investigations';

/** Why the project cannot take an item in the tracker now, or null when it is connected to it. */
const NOT_CONNECTED: Record<IntegrationKindName, (db: Db, projectId: number) => string | null> = {
  notion: (db, projectId) =>
    notionAccessOf(db, projectId) ? null : 'The project is not connected to a Notion data source',
  jira: (db, projectId) =>
    jiraAuthOf(db, projectId) ? null : 'The project is not connected to Jira',
};

/**
 * Asks for a ticket written from an answered investigation, with what the user wants it to cover.
 * The worker drafts it (`claimTicketDraft`), then creates it in the backlog.
 */
export function requestTicket(
  db: Db,
  id: number,
  context: string,
  { target = null }: { target?: IntegrationKindName | null } = {},
): Investigation {
  const current = getInvestigation(db, id);
  if (target !== null && !integrationKind(target).createsItems) {
    throw new InvestigationError(
      `Union cannot create ${integrationKind(target).label} ${integrationKind(target).itemLabel}s yet`,
    );
  }
  const unconnected = target === null ? null : NOT_CONNECTED[target](db, current.projectId);
  if (unconnected !== null) {
    throw new InvestigationError(unconnected);
  }
  if (current.status !== 'succeeded' || current.result === null) {
    throw new InvestigationError('Only an answered investigation can become a ticket');
  }
  if (current.ticketStatus === 'queued' || current.ticketStatus === 'running') {
    throw new InvestigationError('A ticket is already being written from this investigation');
  }
  return db.transaction((tx) => {
    const row = tx
      .update(schema.investigations)
      .set({
        ticketStatus: 'queued',
        ticketContext: context.trim(),
        ticketTarget: target,
        ticketError: null,
      })
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

/** The drafted ticket, its item in the target tracker when one was made, or why it could not be. */
export type DraftedTicket = { draft: TicketDraft; origin?: TicketOrigin; originError?: string };

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

/** Creates the drafted ticket in the backlog and links it to the investigation; or records the failure. */
export function finishTicketDraft(
  db: Db,
  id: number,
  outcome: DraftedTicket | { error: string },
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
      ? createTicket(db, {
          projectId: investigation.projectId,
          ...outcome.draft,
          origin: outcome.origin,
        }).id
      : null;
  if (ticketId !== null) {
    linkToInvestigated(db, investigation, ticketId);
  }
  db.transaction((tx) => {
    tx.update(schema.investigations)
      .set(
        ticketId === null
          ? { ticketStatus: 'failed', ticketError: 'error' in outcome ? outcome.error : null }
          : { ticketStatus: null, ticketError: originErrorOf(investigation, outcome), ticketId },
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

function originErrorOf(
  investigation: Investigation,
  outcome: DraftedTicket | { error: string },
): string | null {
  if (!('originError' in outcome) || outcome.originError === undefined) {
    return null;
  }
  const { label } = integrationKind(investigation.ticketTarget ?? 'notion');
  return `The ticket was created, but not in ${label}: ${outcome.originError}`;
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
