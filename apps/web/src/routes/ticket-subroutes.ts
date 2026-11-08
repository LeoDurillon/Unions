// The routes under `/api/tickets` that have their own module: creation, the issue and pull request imports, a
// ticket's files, its refused commit, the rewrite of its PR description, its grouping by spec, its
// preview, the commands run in its workspace, its base branch, its removal once cancelled.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { ApiServices } from '../services';
import { attachmentRoutes } from './attachments';
import { githubImportRoutes } from './github-imports';
import { previewRoutes } from './preview';
import { addTicket } from './ticket-create';
import { removeCancelledTicket } from './ticket-removal';
import { ticketReviewSubroutes } from './ticket-review-subroutes';
import { ticketWorkspaceRoutes } from './ticket-workspace';

/**
 * The routes under `/api/tickets` that have their own module: creation, the issue and pull request imports, a ticket's files,
 * its refused commit, the rewrite of its PR description, its grouping by spec, its preview, the
 * commands run in its workspace, its base branch, its removal once cancelled.
 */
export function ticketSubroutes(db: Db, services: ApiServices): Hono {
  const { github } = services;
  const routes = new Hono();
  routes.post('/', (c) => addTicket(db, c));
  routes.route('/', githubImportRoutes(db, github));
  routes.route('/:id/attachments', attachmentRoutes(db));
  routes.route('/:id/preview', previewRoutes(db));
  routes.route('/', ticketWorkspaceRoutes(db, github));
  routes.route('/', ticketReviewSubroutes(db, services));
  routes.delete('/:id', (c) => removeCancelledTicket(db, c));
  return routes;
}
