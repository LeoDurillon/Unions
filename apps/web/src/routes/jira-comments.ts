// `/api/tickets/:id/jira-comments`: the comments of the Jira issue a ticket was imported from, read now.
import { jiraAuthOf, type Db, type JiraApi, type Ticket } from '@union/core';
import { Hono } from 'hono';

import { CONFLICT, fail } from '../http';
import type { JiraTabView } from '../jira-comment-types';
import { guarded } from './notion';
import { loadTicket } from './ticket-notion-link';

/** The issue the ticket was imported from. */
function issueKeyOf(ticket: Ticket): string {
  if (ticket.originKind !== 'jira' || !ticket.originId) {
    throw fail(CONFLICT, 'This ticket was not imported from Jira');
  }
  return ticket.originId;
}

/** `GET` reads the comments from Jira on each call: the tab reads them once per opening, and on Refresh. */
export function ticketJiraCommentRoutes(db: Db, jira: JiraApi): Hono {
  const routes = new Hono();
  routes.get('/:id/jira-comments', async (c) => {
    const ticket = loadTicket(db, c);
    const key = issueKeyOf(ticket);
    const auth = jiraAuthOf(db, ticket.projectId);
    if (!auth) {
      throw fail(CONFLICT, 'The project is not connected to Jira');
    }
    const read = await guarded(() => jira.comments(auth, key));
    const view: JiraTabView = {
      key,
      issueUrl: ticket.originUrl ?? `${auth.site}/browse/${key}`,
      comments: read.comments,
      total: read.total,
    };
    return c.json(view);
  });
  return routes;
}
