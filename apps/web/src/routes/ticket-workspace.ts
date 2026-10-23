// The routes about a ticket's workspace: the branch it starts from (and a change of target later),
// the steps it runs, its title and description, the commands run in it, and what its agents used.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { containerRunRoutes } from './container-runs';
import { ticketBaseRoutes } from './ticket-base';
import { ticketEditRoutes } from './ticket-edit';
import { ticketFlowRoutes } from './ticket-flow';
import { ticketRetargetRoutes } from './ticket-retarget';
import { ticketUsage } from './usage';

/**
 * The routes about a ticket's workspace: the branch it starts from (and a change of target later), the steps it runs, its title and
 * description, the commands run in it, and what its agents used.
 */
export function ticketWorkspaceRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.route('/', ticketBaseRoutes(db, github));
  routes.route('/', ticketRetargetRoutes(db, github));
  routes.route('/', ticketFlowRoutes(db));
  routes.route('/', ticketEditRoutes(db));
  routes.route('/:id/container-runs', containerRunRoutes(db));
  routes.get('/:id/usage', (c) => ticketUsage(db, c));
  return routes;
}
