// The routes no project owns: the event stream, the notifications it announces, the running
// previews, Union's update. Also machine settings, Claude usage, and the user guide.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import { claudeUsageRoutes } from './claude-usage';
import { eventRoutes } from './events';
import { guideRoutes } from './guide';
import { notificationRoutes } from './notifications';
import { runningPreviewRoutes } from './running-previews';
import { unionSettingsRoutes } from './union-settings';
import { unionUpdateRoutes } from './union-update';

/** `/events`, `/notifications`, the running `/previews` (the sidebar counts them), `/union-update`, the user `/guide` and Claude usage (`/claude-limits`, a project's `/usage`), under `/api`. */
export function liveRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.route('/events', eventRoutes(db));
  routes.route('/notifications', notificationRoutes(db));
  routes.route('/previews', runningPreviewRoutes(db));
  routes.route('/union-update', unionUpdateRoutes(db));
  routes.route('/union-settings', unionSettingsRoutes(db));
  routes.route('/guide', guideRoutes());
  routes.route('/', claudeUsageRoutes(db));
  return routes;
}
