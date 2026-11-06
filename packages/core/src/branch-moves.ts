// What Union knows of the ticket's branch on GitHub: the commit it last pushed, a move away from it, and a resync onto it.
import { eq } from 'drizzle-orm';

import type { Db } from './db';
import type { BranchMove } from './schema-types';
import * as schema from './tables';
import { emitEvent, getTicket } from './tickets';

function setFields(
  db: Db,
  ticketId: number,
  fields: Partial<typeof schema.tickets.$inferInsert>,
): void {
  db.update(schema.tickets).set(fields).where(eq(schema.tickets.id, ticketId)).run();
}

/** After Union pushed the ticket's branch at `sha`: GitHub has what Union has. */
export function recordPushed(db: Db, ticketId: number, sha: string): void {
  setFields(db, ticketId, { pushedSha: sha, remoteMoved: null });
}

function sameMove(a: BranchMove | null, b: BranchMove | null): boolean {
  return a?.from === b?.from && a?.to === b?.to && a?.kind === b?.kind;
}

/** What the poll found: a move (an event when it is new), or none (the flag goes). */
export function recordMove(db: Db, ticketId: number, move: BranchMove | null): void {
  if (sameMove(getTicket(db, ticketId).remoteMoved, move)) {
    return;
  }
  setFields(db, ticketId, { remoteMoved: move });
  if (move) {
    emitEvent(db, { type: 'branch_moved', ticketId, payload: move });
  }
}

/** The workspace now holds the branch as GitHub has it (`to`); the next agent run is told. */
export function recordResync(db: Db, ticketId: number, moved: { from: string; to: string }): void {
  setFields(db, ticketId, { pushedSha: moved.to, remoteMoved: null, resyncedFrom: moved.from });
  emitEvent(db, { type: 'branch_resynced', ticketId, payload: moved });
}

/** The commit a resync left, once: the run that reads it tells its agent, and the marker goes. */
export function takeResyncedFrom(db: Db, ticketId: number): string | null {
  const from = getTicket(db, ticketId).resyncedFrom;
  if (from !== null) {
    setFields(db, ticketId, { resyncedFrom: null });
  }
  return from;
}
