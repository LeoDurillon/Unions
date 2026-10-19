// The routes under a pull request under review that act on its own checkout or links: preview, commands, Notion page.
import type { Db, NotionApi } from '@union/core';
import { Hono } from 'hono';

import { reviewNotionRoutes } from './review-notion';
import { reviewPreviewRoutes } from './review-preview';
import { reviewRunRoutes } from './review-runs';

/** Under `/api/projects/:projectId/pull-requests/reviews/:number`: `/preview`, `/runs` and `/notion`. */
export function reviewWorkspaceRoutes(db: Db, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.route('/preview', reviewPreviewRoutes(db));
  routes.route('/runs', reviewRunRoutes(db));
  routes.route('/notion', reviewNotionRoutes(db, notion));
  return routes;
}
