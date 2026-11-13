// The routes of a pull request under review about the trackers' items it implements, under `/trackers/:kind`.
// Their text, links and suggestions, and their properties set by hand.

import type { Db, IntegrationApis } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../../github-onboarding';
import { reviewTrackerFieldRoutes } from './review-tracker-fields';
import { reviewTrackerItemRoutes } from './review-tracker-items';
import { reviewTrackerLinkRoutes } from './review-tracker-links';

/** Under the review: `/trackers/:kind` (items, links, suggestions, moves) and `/tracker-fields`. */
export function reviewTrackerRoutes(
  db: Db,
  { github, notion, jira }: { github: OnboardingGitHub } & IntegrationApis,
): Hono {
  const apis = { notion, jira };
  const routes = new Hono();
  // The suggestions before the items, so `/suggestions` is not read as an item's id.
  routes.route('/', reviewTrackerLinkRoutes(db, { apis, github }));
  routes.route('/', reviewTrackerItemRoutes(db, apis));
  routes.route('/', reviewTrackerFieldRoutes(db, apis));
  return routes;
}
