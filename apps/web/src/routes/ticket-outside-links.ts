// A ticket's links to what lives outside Union: its pull request on GitHub, its Notion page and the
// page's discussions.
import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { ApiServices } from '../services';
import { ticketNotionCommentRoutes } from './notion-comments';
import { ticketNotionRoutes } from './ticket-notion-link';
import { linkPullRequest, unlinkPullRequest } from './ticket-pull-request';

/** `/:id/pull-request`, `/:id/notion` and `/:id/notion-comments`: read only on GitHub and Notion. */
export function ticketOutsideLinkRoutes(db: Db, { github, notion }: ApiServices): Hono {
  const routes = new Hono();
  routes.put('/:id/pull-request', (c) => linkPullRequest(db, github, c));
  routes.delete('/:id/pull-request', (c) => unlinkPullRequest(db, c));
  routes.route('/', ticketNotionRoutes(db, notion));
  routes.route('/', ticketNotionCommentRoutes(db, notion));
  return routes;
}
