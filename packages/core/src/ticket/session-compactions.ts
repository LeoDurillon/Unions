// Compactions of a ticket's implementer session: queued from its panel, run by the worker, recovered after a stop.

import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';

import type { Db } from '../db';
import * as schema from '../tables';
import { implementerSession, sessionContext } from './implementer-session';
import { emitEvent, getTicket } from './tickets';

export type SessionCompaction = typeof schema.sessionCompactions.$inferSelect;

export type SessionCompactionOutcome =
  | { status: 'succeeded' }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

/** Why a compaction is refused; the web answers 409 with the message. */
export class SessionCompactionError extends Error {}

const ACTIVE = ['queued', 'running'] as const;

type Executor = Parameters<typeof emitEvent>[0];

/** Every change is an event on the ticket: its panel refreshes on it. */
function changed(db: Executor, row: SessionCompaction): void {
  emitEvent(db, {
    type: 'session_compaction_changed',
    ticketId: row.ticketId,
    payload: { compactionId: row.id, status: row.status, error: row.error },
  });
}

function update(db: Executor, id: number, values: Partial<SessionCompaction>): SessionCompaction {
  const row = db
    .update(schema.sessionCompactions)
    .set(values)
    .where(eq(schema.sessionCompactions.id, id))
    .returning()
    .get();
  changed(db, row);
  return row;
}

export function getSessionCompaction(db: Db, id: number): SessionCompaction | null {
  return (
    db.select().from(schema.sessionCompactions).where(eq(schema.sessionCompactions.id, id)).get() ??
    null
  );
}

/** The ticket's latest compaction, whatever its status. */
export function latestSessionCompaction(db: Executor, ticketId: number): SessionCompaction | null {
  return (
    db
      .select()
      .from(schema.sessionCompactions)
      .where(eq(schema.sessionCompactions.ticketId, ticketId))
      .orderBy(desc(schema.sessionCompactions.id))
      .get() ?? null
  );
}

/** The implementer's session, and the context its next resume starts from (null: not known). */
export type ImplementerSessionSize = { sessionId: string; context: number | null };

export function implementerSessionSize(
  db: Executor,
  ticketId: number,
): ImplementerSessionSize | null {
  const sessionId = implementerSession(db, ticketId);
  return sessionId === null ? null : { sessionId, context: sessionContext(db, sessionId) };
}

/** Why the session cannot be compacted now; null when it can. */
export function compactionRefusal(db: Executor, ticketId: number): string | null {
  const ticket = getTicket(db, ticketId);
  if (ticket.phase.kind === 'running') {
    return 'Wait for the current run to finish: it works in the same session.';
  }
  if (implementerSession(db, ticketId) === null) {
    return 'The implementation has no session yet.';
  }
  const rewriting = db
    .select({ id: schema.prDescriptions.id })
    .from(schema.prDescriptions)
    .where(
      and(
        eq(schema.prDescriptions.ticketId, ticketId),
        inArray(schema.prDescriptions.status, ['queued', 'running']),
      ),
    )
    .get();
  return rewriting ? 'Wait for the PR description rewrite: it resumes the same session.' : null;
}

/** Queues a compaction of the implementer's session; refused while one waits or runs. */
export function queueSessionCompaction(db: Db, ticketId: number): SessionCompaction {
  return db.transaction((tx) => {
    const reason = compactionRefusal(tx, ticketId);
    const latest = latestSessionCompaction(tx, ticketId);
    if (latest && ACTIVE.some((status) => status === latest.status)) {
      throw new SessionCompactionError('The session is already being compacted.');
    }
    const size = implementerSessionSize(tx, ticketId);
    if (reason !== null || size === null) {
      throw new SessionCompactionError(reason ?? 'The implementation has no session yet.');
    }
    const row = tx
      .insert(schema.sessionCompactions)
      .values({ ticketId, sessionId: size.sessionId, contextBefore: size.context })
      .returning()
      .get();
    changed(tx, row);
    return row;
  });
}

/**
 * The oldest queued compaction, now running; null when none waits. Not one of a ticket whose
 * description is being rewritten: both resume the same session.
 */
export function claimSessionCompaction(db: Db): SessionCompaction | null {
  return db.transaction((tx) => {
    const busy = tx
      .select({ ticketId: schema.prDescriptions.ticketId })
      .from(schema.prDescriptions)
      .where(eq(schema.prDescriptions.status, 'running'))
      .all()
      .map((row) => row.ticketId);
    const queued = eq(schema.sessionCompactions.status, 'queued');
    const next = tx
      .select()
      .from(schema.sessionCompactions)
      .where(
        busy.length === 0
          ? queued
          : and(queued, notInArray(schema.sessionCompactions.ticketId, busy)),
      )
      .orderBy(asc(schema.sessionCompactions.id))
      .get();
    return next ? update(tx, next.id, { status: 'running', startedAt: Date.now() }) : null;
  });
}

export function finishSessionCompaction(
  db: Db,
  id: number,
  outcome: SessionCompactionOutcome,
): void {
  update(db, id, {
    status: outcome.status,
    error: outcome.status === 'failed' ? outcome.error : null,
    finishedAt: Date.now(),
  });
}

/** Cancels a compaction still waiting for a slot; false when it already started (its runner stops it). */
export function cancelQueuedSessionCompaction(db: Db, id: number): boolean {
  const [row] = db
    .update(schema.sessionCompactions)
    .set({ status: 'cancelled', finishedAt: Date.now() })
    .where(
      and(eq(schema.sessionCompactions.id, id), eq(schema.sessionCompactions.status, 'queued')),
    )
    .returning()
    .all();
  if (!row) {
    return false;
  }
  changed(db, row);
  return true;
}

/** What a stopped worker left: a running compaction failed. */
export function recoverSessionCompactions(db: Db): void {
  const rows = db
    .select()
    .from(schema.sessionCompactions)
    .where(eq(schema.sessionCompactions.status, 'running'))
    .all();
  for (const row of rows) {
    update(db, row.id, {
      status: 'failed',
      error: 'The worker stopped during the compaction',
      finishedAt: Date.now(),
    });
  }
}
