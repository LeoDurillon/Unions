// `/api/tickets/github-issue` and `/api/tickets/github-pull-request`: tickets imported from the project's repository.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { issueImportRoutes } from './issue-import';
import { pullRequestImportRoutes } from './pr-import';

/** The imports from GitHub: an issue, or a pull request on its own branch. */
export function githubImportRoutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.route('/github-issue', issueImportRoutes(db, github));
  routes.route('/github-pull-request', pullRequestImportRoutes(db, github));
  return routes;
}
