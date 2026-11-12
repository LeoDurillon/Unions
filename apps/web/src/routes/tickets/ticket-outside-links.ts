// A ticket's links outside Union: its GitHub pull request, its Notion page and its discussions, its
// Jira issue's comments.

import type { Db } from '@union/core';
import { Hono } from 'hono';

import type { ApiServices } from '../../services';
import { ticketJiraCommentRoutes } from '../jira-comments';
import { ticketNotionCommentRoutes } from '../notion-comments';
import { ticketJiraLinkRoutes } from './ticket-jira-link';
import { ticketNotionRoutes } from './ticket-notion-link';
import { linkPullRequest, unlinkPullRequest } from './ticket-pull-request';

/** `/:id/pull-request`, `/:id/notion`, `/:id/notion-comments` and `/:id/jira-comments`. */
export function ticketOutsideLinkRoutes(db: Db, { github, notion, jira }: ApiServices): Hono {
  const routes = new Hono();
  routes.put('/:id/pull-request', (c) => linkPullRequest(db, github, c));
  routes.delete('/:id/pull-request', (c) => unlinkPullRequest(db, c));
  routes.route('/', ticketNotionRoutes(db, notion));
  routes.route('/', ticketNotionCommentRoutes(db, notion));
  routes.route('/', ticketJiraCommentRoutes(db, jira));
  routes.route('/', ticketJiraLinkRoutes(db, jira));
  return routes;
}
