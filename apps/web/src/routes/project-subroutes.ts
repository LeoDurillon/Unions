// The routes under `/api/projects` that have their own module: event rules and what they pick from,
// integrations, preview settings, the agent image, files, memory, the runs' live progress, the repository's files.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { ApiServices } from '../services';
import { eventRuleRoutes } from './event-rules';
import { projectIntegrationRoutes } from './integrations';
import { memoryRoutes } from './memory';
import { projectGitHubRoutes } from './project-github';
import { runProgressRoutes } from './run-progress';
import { workspaceSettingsRoutes } from './workspace-settings';

/** The routes under `/api/projects` that have their own module: event rules and what they pick from, integrations, preview settings, the agent image, files, memory, the runs' live progress, the repository's files. */
export function projectSubroutes(db: Db, { github, notion, jira, repository }: ApiServices): Hono {
  const routes = new Hono();
  routes.route('/', eventRuleRoutes(db, notion));
  routes.route('/', projectIntegrationRoutes(db, { notion, jira }));
  routes.route('/', projectGitHubRoutes(db, { github, repository }));
  routes.route('/', workspaceSettingsRoutes(db));
  routes.route('/', memoryRoutes(db));
  routes.route('/', runProgressRoutes(db));
  return routes;
}
