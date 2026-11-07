// The project's GitHub routes that have their own module: what an event rule picks from, the Repository tab, its GitHub Project.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { ApiServices } from '../services';
import { githubProjectLinkRoutes } from './github-project-link';
import { repositoryRoutes } from './repository';
import { ruleChoiceRoutes } from './rule-choices';

/** What an event rule picks from (labels, users, Project fields), the Repository tab's reads and the GitHub Project, under `/api/projects`. */
export function projectGitHubRoutes(
  db: Db,
  { github, repository }: Pick<ApiServices, 'github' | 'repository'>,
): Hono {
  const routes = new Hono();
  routes.route('/', ruleChoiceRoutes(db, github));
  routes.route('/', repositoryRoutes(db, { github, repository }));
  routes.route('/', githubProjectLinkRoutes(db, github));
  return routes;
}
