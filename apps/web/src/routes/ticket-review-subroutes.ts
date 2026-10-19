import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { ApiServices } from '../services';
import { ticketExplanationRoutes, ticketGroupingRoutes } from './grouping-targets';
import { prChecksRoutes } from './pr-checks';
import { prDescriptionRoutes } from './pr-description';
import { refusedCommit } from './refused-commit';
import { ticketCommitRoutes } from './ticket-commits';

/**
 * A ticket's routes about its change: its refused commit, its PR description rewrite, its grouping by
 * spec, the explanations of its lines, its commits, its pull request's CI checks.
 */
export function ticketReviewSubroutes(db: Db, { github, notion, ci }: ApiServices): Hono {
  const routes = new Hono();
  routes.route('/:id/pr-description', prDescriptionRoutes(db));
  routes.get('/:id/refused-commit', (c) => refusedCommit(db, c));
  routes.route('/:id/groupings', ticketGroupingRoutes(db, github, notion));
  routes.route('/:id/explanations', ticketExplanationRoutes(db));
  routes.route('/:id/commits', ticketCommitRoutes(db));
  routes.route('/:id/pr-checks', prChecksRoutes(db, ci));
  return routes;
}
