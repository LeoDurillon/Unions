// Follows the event log and writes a notification for each event that needs the user, announcing it on the stream.
import {
  emitEvent,
  moveCursor,
  notificationFor,
  schema,
  unreadEvents,
  type Db,
  type NotificationDraft,
} from '@union/core';
import { eq } from 'drizzle-orm';

const CURSOR = 'notifications';
const BATCH = 500;

type Event = typeof schema.events.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Subject = { projectId: number; title: string };

/** The ticket or investigation the event is about; null when it has neither or it is gone. */
function subjectOf(tx: Tx, event: Event): Subject | null {
  const columns = { projectId: schema.tickets.projectId, title: schema.tickets.title };
  if (event.ticketId !== null) {
    const ticket = tx
      .select(columns)
      .from(schema.tickets)
      .where(eq(schema.tickets.id, event.ticketId))
      .get();
    return ticket ?? null;
  }
  if (event.investigationId !== null) {
    const investigation = tx
      .select({
        projectId: schema.investigations.projectId,
        title: schema.investigations.title,
      })
      .from(schema.investigations)
      .where(eq(schema.investigations.id, event.investigationId))
      .get();
    return investigation ?? null;
  }
  return null;
}

/**
 * Writes the notification once (per event, or per rule and event) and logs `notification_created`
 * for the browser. Returns whether it was new.
 */
export function recordNotification(
  tx: Tx | Db,
  values: typeof schema.notifications.$inferInsert,
): boolean {
  // An event already notified (a write cut short before the cursor moved) inserts nothing.
  const [row] = tx
    .insert(schema.notifications)
    .values(values)
    .onConflictDoNothing()
    .returning()
    .all();
  if (!row) {
    return false;
  }
  emitEvent(tx, {
    type: 'notification_created',
    payload: {
      notificationId: row.id,
      projectId: row.projectId,
      ticketId: row.ticketId,
      investigationId: row.investigationId,
      kind: row.kind,
      title: row.title,
      detail: row.detail,
    },
  });
  return true;
}

function record(tx: Tx, event: Event, subject: Subject, draft: NotificationDraft): boolean {
  return recordNotification(tx, {
    ...draft,
    projectId: subject.projectId,
    ticketId: event.ticketId,
    investigationId: event.investigationId,
    eventSeq: event.seq,
  });
}

/**
 * Reads the events logged since the last call and writes a notification for each one that needs
 * the user. The first call starts at the end of the log: nothing is notified about the past.
 * Returns how many were written.
 */
export function writeNotifications(db: Db): number {
  const events = unreadEvents(db, CURSOR, BATCH);
  const last = events.at(-1);
  if (!last) {
    return 0;
  }
  let written = 0;
  db.transaction((tx) => {
    for (const event of events) {
      const subject = subjectOf(tx, event);
      const draft = subject ? notificationFor(event, subject) : null;
      if (subject && draft && record(tx, event, subject, draft)) {
        written += 1;
      }
    }
    moveCursor(tx, CURSOR, last.seq);
  });
  return written;
}
