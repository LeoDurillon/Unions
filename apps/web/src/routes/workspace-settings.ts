// The project settings of what a ticket's workspace runs with: its preview, the files it gets, and the image its agents run in.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import { agentImageRoutes } from './agent-image';
import { previewSettingsRoutes } from './preview-settings';
import { projectFileRoutes } from './project-files';

/** Under `/api/projects`: the preview settings, the project's files and its agent image. */
export function workspaceSettingsRoutes(db: Db): Hono {
  const routes = new Hono();
  routes.route('/', previewSettingsRoutes(db));
  routes.route('/', projectFileRoutes(db));
  routes.route('/', agentImageRoutes(db));
  return routes;
}
