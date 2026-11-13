// A ticket's links outside Union: its GitHub pull request, its tracker item (Notion page, Jira issue).
// Also the item's comments and properties.

import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { ApiServices } from '../../services';
import { ticketTrackerCommentRoutes } from '../tracker-comments';
import { ticketTrackerFieldRoutes } from '../tracker-fields';
import { ticketTrackerItemRoutes } from '../tracker-item';
import { ticketJiraLinkRoutes } from './ticket-jira-link';
import { ticketNotionRoutes } from './ticket-notion-link';
import { linkPullRequest, unlinkPullRequest } from './ticket-pull-request';

/** `/:id/pull-request`, `/:id/notion`, `/:id/trackers/:kind/comments`, `…/item` and `/:id/tracker-fields`. */
export function ticketOutsideLinkRoutes(db: Db, { github, notion, jira }: ApiServices): Hono {
  const routes = new Hono();
  routes.put('/:id/pull-request', (c) => linkPullRequest(db, github, c));
  routes.delete('/:id/pull-request', (c) => unlinkPullRequest(db, c));
  routes.route('/', ticketNotionRoutes(db, notion));
  routes.route('/', ticketTrackerCommentRoutes(db, { notion, jira }));
  routes.route('/', ticketTrackerItemRoutes(db, { notion, jira }));
  routes.route('/', ticketJiraLinkRoutes(db, jira));
  routes.route('/', ticketTrackerFieldRoutes(db, notion, jira));
  return routes;
}
