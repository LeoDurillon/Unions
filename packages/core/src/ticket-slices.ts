// A ticket's slices once split into a stack: read bottom first, and replaced by a new split.
import { asc, eq } from 'drizzle-orm';

import type { Db } from './db';
import { ticketSlices } from './schema-ticket-slices';

export type TicketSlice = typeof ticketSlices.$inferSelect;
export type NewTicketSlice = Omit<
  typeof ticketSlices.$inferInsert,
  'id' | 'ticketId' | 'createdAt' | 'updatedAt'
>;

/** The ticket's slices, bottom first; empty when it is not split. */
export function listSlices(db: Db, ticketId: number): TicketSlice[] {
  return db
    .select()
    .from(ticketSlices)
    .where(eq(ticketSlices.ticketId, ticketId))
    .orderBy(asc(ticketSlices.position))
    .all();
}

/** The slices not merged yet, bottom first: the stack still to restack, push and review. */
export function openSlices(db: Db, ticketId: number): TicketSlice[] {
  return listSlices(db, ticketId).filter((slice) => slice.prState !== 'merged');
}

/** A new split's slices replace the old ones, in one transaction. */
export function replaceSlices(db: Db, ticketId: number, slices: readonly NewTicketSlice[]): void {
  db.transaction((tx) => {
    tx.delete(ticketSlices).where(eq(ticketSlices.ticketId, ticketId)).run();
    for (const slice of slices) {
      tx.insert(ticketSlices)
        .values({ ...slice, ticketId })
        .run();
    }
  });
}
