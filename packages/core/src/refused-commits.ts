// Refused commits: the ticket's last one, and the user's decision on it.
import { desc, eq } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';

export type RefusedCommit = typeof schema.refusedCommits.$inferSelect;

/** The ticket's last refused commit: the one a `commit_refused` phase is waiting on. */
export function latestRefusal(db: Db, ticketId: number): RefusedCommit | undefined {
  return db
    .select()
    .from(schema.refusedCommits)
    .where(eq(schema.refusedCommits.ticketId, ticketId))
    .orderBy(desc(schema.refusedCommits.id))
    .get();
}

/** Records the user's decision; the worker applies it when the run resumes. */
export function decideRefusal(
  db: Db,
  ticketId: number,
  decision: { resolution: 'commit' | 'discard' | 'revise'; message?: string },
): void {
  const refusal = latestRefusal(db, ticketId);
  if (!refusal || refusal.resolvedAt !== null) {
    throw new Error(`Ticket ${ticketId} has no refused commit waiting for a decision`);
  }
  db.update(schema.refusedCommits)
    .set({
      resolution: decision.resolution,
      message: decision.message ?? refusal.message,
      // Sending the agent back closes it now: its next run decides again.
      resolvedAt: decision.resolution === 'revise' ? Date.now() : null,
    })
    .where(eq(schema.refusedCommits.id, refusal.id))
    .run();
}

export function markRefusalResolved(db: Db, id: number): void {
  db.update(schema.refusedCommits)
    .set({ resolvedAt: Date.now() })
    .where(eq(schema.refusedCommits.id, id))
    .run();
}
