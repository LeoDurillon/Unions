// The routes the browser follows on its own: the event stream, the notifications it announces, the running previews, Union's update.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import { eventRoutes } from './events';
import { notificationRoutes } from './notifications';
import { runningPreviewRoutes } from './running-previews';
import { unionUpdateRoutes } from './union-update';

/** `/events`, `/notifications`, the running `/previews` (the sidebar counts them) and `/union-update`, under `/api`. */
export function liveRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.route('/events', eventRoutes(db));
  routes.route('/notifications', notificationRoutes(db));
  routes.route('/previews', runningPreviewRoutes(db));
  routes.route('/union-update', unionUpdateRoutes(db));
  return routes;
}
