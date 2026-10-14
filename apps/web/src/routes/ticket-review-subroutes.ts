import type { Db, NotionApi } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { ticketGroupingRoutes } from './grouping-targets';
import { prDescriptionRoutes } from './pr-description';
import { refusedCommit } from './refused-commit';

/** A ticket's routes about its change: its refused commit, its PR description rewrite, its grouping by spec. */
export function ticketReviewSubroutes(db: Db, github: OnboardingGitHub, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.route('/:id/pr-description', prDescriptionRoutes(db));
  routes.get('/:id/refused-commit', (c) => refusedCommit(db, c));
  routes.route('/:id/groupings', ticketGroupingRoutes(db, github, notion));
  return routes;
}
