// A ticket's links outside Union: its GitHub pull request, its tracker item (Notion page, Jira issue).
// Also the item's comments and properties.

import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { ApiServices } from '../../services';
import { ticketTrackerCommentRoutes } from '../tracker-comments';
import { ticketTrackerFieldRoutes } from '../tracker-fields';
import { ticketTrackerItemRoutes } from '../tracker-item';
import { linkPullRequest, unlinkPullRequest } from './ticket-pull-request';
import { ticketTrackerLinkRoutes } from './ticket-tracker-link';

/** `/:id/pull-request`, `/:id/trackers/:kind/link`, `…/comments`, `…/item`, `…/moves` and `/:id/tracker-fields`. */
export function ticketOutsideLinkRoutes(db: Db, { github, notion, jira }: ApiServices): Hono {
  const routes = new Hono();
  routes.put('/:id/pull-request', (c) => linkPullRequest(db, github, c));
  routes.delete('/:id/pull-request', (c) => unlinkPullRequest(db, c));
  routes.route('/', ticketTrackerLinkRoutes(db, { notion, jira }));
  routes.route('/', ticketTrackerCommentRoutes(db, { notion, jira }));
  routes.route('/', ticketTrackerItemRoutes(db, { notion, jira }));
  routes.route('/', ticketTrackerFieldRoutes(db, notion, jira));
  return routes;
}
