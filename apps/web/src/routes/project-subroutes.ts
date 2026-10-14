import type { Db, NotionApi } from '@union/core';
import { Hono } from 'hono';

import { eventRuleRoutes } from './event-rules';
import { previewSettingsRoutes } from './preview-settings';
import { projectFileRoutes } from './project-files';

/** The routes under `/api/projects` that have their own module: event rules, preview settings, files. */
export function projectSubroutes(db: Db, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.route('/', eventRuleRoutes(db, notion));
  routes.route('/', previewSettingsRoutes(db));
  routes.route('/', projectFileRoutes(db));
  return routes;
}
