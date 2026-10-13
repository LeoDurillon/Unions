import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { attachmentRoutes } from './attachments';
import { issueImportRoutes } from './issue-import';

/** The routes under `/api/tickets` that have their own module: the issue import, a ticket's files. */
export function ticketSubroutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.route('/github-issue', issueImportRoutes(db, github));
  routes.route('/:id/attachments', attachmentRoutes(db));
  return routes;
}
