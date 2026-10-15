import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { containerRunRoutes } from './container-runs';
import { ticketBaseRoutes } from './ticket-base';

/** The routes about a ticket's workspace: the branch it starts from, and commands run in it. */
export function ticketWorkspaceRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.route('/', ticketBaseRoutes(db, github));
  routes.route('/:id/container-runs', containerRunRoutes(db));
  return routes;
}
