// The routes under a pull request under review that act on its own checkout: its preview and its commands.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import { reviewPreviewRoutes } from './review-preview';
import { reviewRunRoutes } from './review-runs';

/** Under `/api/projects/:projectId/pull-requests/reviews/:number`: `/preview` and `/runs`. */
export function reviewWorkspaceRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.route('/preview', reviewPreviewRoutes(db));
  routes.route('/runs', reviewRunRoutes(db));
  return routes;
}
