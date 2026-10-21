// The `union_update` row: the worker's checks and the update's state, read by the sidebar.
import { desc, eq } from 'drizzle-orm';

import type { Db } from './db';
import { isEvent, type EventPayloads } from './event-catalog';
import { events } from './schema';
import { unionUpdate } from './schema-union-update';

export type UnionUpdate = typeof unionUpdate.$inferSelect;
export type UnionUpdateStatus = UnionUpdate['status'];
export type UpdateCheck = Pick<
  UnionUpdate,
  'localSha' | 'remoteSha' | 'ahead' | 'behind' | 'subjects' | 'migrations' | 'refusal' | 'error'
>;

const ROW = 1;

/** Null before the worker's first check. */
export function readUnionUpdate(db: Db): UnionUpdate | null {
  return db.select().from(unionUpdate).where(eq(unionUpdate.id, ROW)).get() ?? null;
}

/** A check's result; the status is left as it is (a check can run while an update is refused). */
export function recordUpdateCheck(db: Db, check: UpdateCheck): void {
  const values = { ...check, checkedAt: Date.now() };
  db.insert(unionUpdate)
    .values({ id: ROW, ...values })
    .onConflictDoUpdate({ target: unionUpdate.id, set: values })
    .run();
}

/** Moves the update to `status`; `error` is cleared unless given. */
export function setUpdateStatus(
  db: Db,
  status: UnionUpdateStatus,
  error: string | null = null,
): void {
  db.update(unionUpdate)
    .set({ status, error, statusAt: Date.now() })
    .where(eq(unionUpdate.id, ROW))
    .run();
}

/** Whether new work waits: an update is pulling or about to restart Union. */
export function updateInProgress(row: UnionUpdate | null): boolean {
  return row !== null && (row.status === 'updating' || row.status === 'restarting');
}

/** The last restart an update asked for, or null when none did. */
export function lastRestartAsked(db: Db): EventPayloads['union_restart'] | null {
  const event = db
    .select()
    .from(events)
    .where(eq(events.type, 'union_restart'))
    .orderBy(desc(events.seq))
    .limit(1)
    .get();
  return event && isEvent(event, 'union_restart') ? event.payload : null;
}
