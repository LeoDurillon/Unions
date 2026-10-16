// The routes the browser follows on its own: the event stream, and the notifications the stream announces.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import { eventRoutes } from './events';
import { notificationRoutes } from './notifications';

/** `/events` and `/notifications`, under `/api`. */
export function liveRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.route('/events', eventRoutes(db));
  routes.route('/notifications', notificationRoutes(db));
  return routes;
}
