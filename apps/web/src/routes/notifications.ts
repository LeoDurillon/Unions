// `/api/notifications`: what needs the user across every project (the worker writes them), and marking them read.
import { schema, type Db, type Notification } from '@union/core';
import { and, count, desc, eq, isNull, lt } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { fail, NOT_FOUND, requireId } from '../http';

const PAGE = 30;
const MAX_PAGE = 100;

/** A page of notifications, newest first, and how many are unread in all. */
export type NotificationPage = { items: Notification[]; unread: number };

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
  return c.json({ items, unread } satisfies NotificationPage);
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

/** `/api/notifications`: what needs the user across every project, and marking them read. */
export function notificationRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.get('/', (c) => list(db, c));
  routes.post('/read-all', (c) => markAllRead(db, c));
  routes.post('/:id/read', (c) => markRead(db, c));
  return routes;
}
