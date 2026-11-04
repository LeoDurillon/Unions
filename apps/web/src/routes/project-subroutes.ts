// The routes under `/api/projects` that have their own module: event rules and what they pick from,
// integrations, preview settings, files, memory, the runs' live progress.
import type { Db, NotionApi } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { eventRuleRoutes } from './event-rules';
import { projectIntegrationRoutes } from './integrations';
import { memoryRoutes } from './memory';
import { previewSettingsRoutes } from './preview-settings';
import { projectFileRoutes } from './project-files';
import { ruleChoiceRoutes } from './rule-choices';
import { runProgressRoutes } from './run-progress';

/** The routes under `/api/projects` that have their own module: event rules and what they pick from, integrations, preview settings, files, memory, the runs' live progress. */
export function projectSubroutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.route('/', eventRuleRoutes(db, notion));
  routes.route('/', projectIntegrationRoutes(db, { notion }));
  routes.route('/', ruleChoiceRoutes(db, github));
  routes.route('/', previewSettingsRoutes(db));
  routes.route('/', projectFileRoutes(db));
  routes.route('/', memoryRoutes(db));
  routes.route('/', runProgressRoutes(db));
  return routes;
}
