// The project's reads from GitHub that have their own module: what an event rule picks from, the Repository tab.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { ApiServices } from '../services';
import { repositoryRoutes } from './repository';
import { ruleChoiceRoutes } from './rule-choices';

/** What an event rule picks from (labels, users, Project fields) and the Repository tab's reads, under `/api/projects`. */
export function projectGitHubRoutes(
  db: Db,
  { github, repository }: Pick<ApiServices, 'github' | 'repository'>,
): Hono {
  const routes = new Hono();
  routes.route('/', ruleChoiceRoutes(db, github));
  routes.route('/', repositoryRoutes(db, repository));
  return routes;
}
