import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { OnboardingGitHub } from '../github-onboarding';
import { attachmentRoutes } from './attachments';
import { issueImportRoutes } from './issue-import';
import { prDescriptionRoutes } from './pr-description';
import { previewRoutes } from './preview';
import { refusedCommit } from './refused-commit';
import { addTicket } from './ticket-create';
import { removeCancelledTicket } from './ticket-removal';

/**
 * The routes under `/api/tickets` that have their own module: creation, the issue import, a ticket's files,
 * its refused commit, the rewrite of its PR description, its preview, its removal once cancelled.
 */
export function ticketSubroutes(db: Db, github: OnboardingGitHub): Hono {
  const routes = new Hono();
  routes.post('/', (c) => addTicket(db, c));
  routes.route('/github-issue', issueImportRoutes(db, github));
  routes.route('/:id/attachments', attachmentRoutes(db));
  routes.route('/:id/pr-description', prDescriptionRoutes(db));
  routes.route('/:id/preview', previewRoutes(db));
  routes.get('/:id/refused-commit', (c) => refusedCommit(db, c));
  routes.delete('/:id', (c) => removeCancelledTicket(db, c));
  return routes;
}
