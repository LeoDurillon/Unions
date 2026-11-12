// `/api/notifications`: what needs the user across every project (the worker writes them), marking them read and clearing them.
import { schema, type Db, type Notification } from '@union/core';
import { toAct } from '@union/core/needs-you';
import { and, count, desc, eq, isNull, lt } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { fail, NOT_FOUND, requireId } from '../http';

const PAGE = 30;
const MAX_PAGE = 100;

/** A notification, and whether it still asks something of the user (`toAct` in core). */
export type NotificationView = Notification & { toAct: boolean };

/**
 * A page of notifications, newest first; how many are unread in all, and `toAct`: how many tickets and
 * investigations still ask something (two approvals of one ticket count once).
 */
export type NotificationPage = { items: NotificationView[]; unread: number; toAct: number };

type Asking = { ids: Set<number>; subjects: number };

/** What a notification is about: its ticket, else its investigation, else itself. */
function subjectOf(row: {
  id: number;
  ticketId: number | null;
  investigationId: number | null;
}): string {
  if (row.ticketId !== null) {
    return `ticket:${row.ticketId}`;
  }
  return row.investigationId === null
    ? `notification:${row.id}`
    : `investigation:${row.investigationId}`;
}

/** The unread notifications that still ask something (those about a ticket read its state now), and what about. */
function askingNow(db: Db): Asking {
  const rows = db
    .select({
      id: schema.notifications.id,
      ticketId: schema.notifications.ticketId,
      investigationId: schema.notifications.investigationId,
      kind: schema.notifications.kind,
      readAt: schema.notifications.readAt,
      phase: schema.tickets.phase,
      prState: schema.tickets.prState,
      prChecksState: schema.tickets.prChecksState,
    })
    .from(schema.notifications)
    .leftJoin(schema.tickets, eq(schema.tickets.id, schema.notifications.ticketId))
    .where(isNull(schema.notifications.readAt))
    .all();
  const open = rows.filter((row) =>
    toAct(
      row,
      row.phase === null
        ? null
        : { phase: row.phase, prState: row.prState, prChecksState: row.prChecksState },
    ),
  );
  return {
    ids: new Set(open.map((row) => row.id)),
    subjects: new Set(open.map((row) => subjectOf(row))).size,
  };
}

function pageSize(value: string | undefined): number {
  const size = Number(value);
  return Number.isInteger(size) && size > 0 ? Math.min(size, MAX_PAGE) : PAGE;
}

/** `?before=<id>` continues after the last one shown; `?limit=` sets the page size. */
function list(db: Db, c: Context): Response {
  const before = c.req.query('before');
  const items = db
    .select()
    .from(schema.notifications)
    .where(
      before === undefined
        ? undefined
        : lt(schema.notifications.id, requireId(before, 'notification id')),
    )
    .orderBy(desc(schema.notifications.id))
    .limit(pageSize(c.req.query('limit')))
    .all();
  const unread =
    db
      .select({ value: count() })
      .from(schema.notifications)
      .where(isNull(schema.notifications.readAt))
      .get()?.value ?? 0;
  const open = askingNow(db);
  const views = items.map((item) => Object.assign(item, { toAct: open.ids.has(item.id) }));
  return c.json({ items: views, unread, toAct: open.subjects } satisfies NotificationPage);
}

function markRead(db: Db, c: Context): Response {
  const id = requireId(c.req.param('id'), 'notification id');
  const found = db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(eq(schema.notifications.id, id))
    .get();
  if (!found) {
    throw fail(NOT_FOUND, `Notification ${id} not found`);
  }
  db.update(schema.notifications)
    .set({ readAt: Date.now() })
    .where(and(eq(schema.notifications.id, id), isNull(schema.notifications.readAt)))
    .run();
  return c.json({ id });
}

function markAllRead(db: Db, c: Context): Response {
  const marked = db
    .update(schema.notifications)
    .set({ readAt: Date.now() })
    .where(isNull(schema.notifications.readAt))
    .returning({ id: schema.notifications.id })
    .all();
  return c.json({ marked: marked.length });
}

/** Deletes every notification: the worker's cursor is past their events, so none comes back. */
function clearAll(db: Db, c: Context): Response {
  const cleared = db.delete(schema.notifications).returning({ id: schema.notifications.id }).all();
  return c.json({ cleared: cleared.length });
}

/** `/api/notifications`: what needs the user across every project, marking them read and clearing them. */
export function notificationRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => list(db, c));
  routes.delete('/', (c) => clearAll(db, c));
  routes.post('/read-all', (c) => markAllRead(db, c));
  routes.post('/:id/read', (c) => markRead(db, c));
  return routes;
}
