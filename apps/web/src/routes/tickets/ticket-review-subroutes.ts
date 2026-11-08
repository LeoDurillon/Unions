// A ticket's routes about its change: its refused commit, its PR description rewrite, its grouping
// by spec and its specs, the explanations of its lines, its spec report, its review agents' runs, its commits, its pull request's CI checks and replies, its review.

import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { ApiServices } from '../../services';
import { prChecksRoutes } from '../pull-requests/pr-checks';
import { ticketReplyRoutes } from '../pull-requests/pr-comment-replies';
import { prDescriptionRoutes } from '../pull-requests/pr-description';
import { refusedCommit } from '../refused-commit';
import {
  ticketExplanationRoutes,
  ticketGroupingRoutes,
  ticketReportRoutes,
  ticketReviewAgentRoutes,
  ticketSpecRoutes,
} from '../review/grouping-targets';
import { reviewRoutes } from '../review/review';
import { ticketCommitRoutes } from './ticket-commits';

/**
 * A ticket's routes about its change: its refused commit, its PR description rewrite, its grouping by
 * spec and its specs, the explanations of its lines, its spec report, its review agents' runs, its commits, its pull request's CI checks and replies, its review.
 */
export function ticketReviewSubroutes(db: Db, { github, notion, jira, ci }: ApiServices): Hono {
  const routes = new Hono();
  const clients = { github, notion, jira };
  routes.route('/:id/pr-description', prDescriptionRoutes(db));
  routes.get('/:id/refused-commit', (c) => refusedCommit(db, c));
  routes.route('/:id/groupings', ticketGroupingRoutes(db, clients));
  routes.route('/:id/explanations', ticketExplanationRoutes(db));
  routes.route('/:id/specs', ticketSpecRoutes(db, clients));
  routes.route('/:id/reports', ticketReportRoutes(db, clients));
  routes.route('/:id/review-agents', ticketReviewAgentRoutes(db, clients));
  routes.route('/:id/commits', ticketCommitRoutes(db));
  routes.route('/:id/pr-checks', prChecksRoutes(db, ci));
  routes.route('/:id/pr-replies', ticketReplyRoutes(db));
  routes.route('/', reviewRoutes(db, github));
  return routes;
}
