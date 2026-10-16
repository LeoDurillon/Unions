import type { Db, NotionApi } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { eventRuleRoutes } from './event-rules';
import { previewSettingsRoutes } from './preview-settings';
import { projectFileRoutes } from './project-files';
import { ruleChoiceRoutes } from './rule-choices';

/** The routes under `/api/projects` that have their own module: event rules and what they pick from, preview settings, files. */
export function projectSubroutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.route('/', eventRuleRoutes(db, notion));
  routes.route('/', ruleChoiceRoutes(db, github));
  routes.route('/', previewSettingsRoutes(db));
  routes.route('/', projectFileRoutes(db));
  return routes;
}
