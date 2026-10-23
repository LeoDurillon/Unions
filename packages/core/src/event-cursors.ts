// Readers that follow the event log (the rule deliveries, the notifications) and how far each got.
import { asc, desc, eq, gt } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './tables';

type Event = typeof schema.events.$inferSelect;

/** The `seq` of the last event the reader `name` handled; null before its first read. */
function readCursor(db: Pick<Db, 'select'>, name: string): number | null {
  const row = db.select().from(schema.eventCursors).where(eq(schema.eventCursors.name, name)).get();
  return row?.seq ?? null;
}

export function moveCursor(db: Pick<Db, 'insert'>, name: string, seq: number): void {
  db.insert(schema.eventCursors)
    .values({ name, seq })
    .onConflictDoUpdate({ target: schema.eventCursors.name, set: { seq } })
    .run();
}

/**
 * The next events the reader `name` has not handled, oldest first, at most `limit`. Its first call
 * starts it at the end of the log (nothing before is replayed) and returns none.
 */
export function unreadEvents(db: Db, name: string, limit: number): Event[] {
  const cursor = readCursor(db, name);
  if (cursor === null) {
    const last = db.select().from(schema.events).orderBy(desc(schema.events.seq)).get();
    moveCursor(db, name, last?.seq ?? 0);
    return [];
  }
  return db
    .select()
    .from(schema.events)
    .where(gt(schema.events.seq, cursor))
    .orderBy(asc(schema.events.seq))
    .limit(limit)
    .all();
}
