// The project settings of what a ticket's workspace runs with: its preview (and its shared services), the files it gets, and the image its agents run in.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import { agentImageRoutes } from './agent-image';
import { previewSettingsRoutes } from './preview-settings';
import { projectFileRoutes } from './project-files';
import { sharedServicesRoutes } from './shared-services';

/** Under `/api/projects`: the preview settings and shared services, the project's files and its agent image. */
export function workspaceSettingsRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.route('/', previewSettingsRoutes(db));
  routes.route('/', projectFileRoutes(db));
  routes.route('/', agentImageRoutes(db));
  routes.route('/', sharedServicesRoutes(db));
  return routes;
}
