// `/api/tickets/:id/jira-comments`: the comments of the Jira issue a ticket was imported from, read now, and those
// the user sends to it (posted by the worker).
import { jiraAuthOf, type Db, type JiraApi, type Ticket } from '@union/core';
import { Hono } from 'hono';

import { ACCEPTED, CONFLICT, fail, readObject } from '../http';
import { pendingJiraComments, queueJiraComment } from '../jira-comment-commands';
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

/** Who calls Jira for the ticket's project; refused when it is not connected any more. */
function authFor(db: Db, ticket: Ticket): NonNullable<ReturnType<typeof jiraAuthOf>> {
  const auth = jiraAuthOf(db, ticket.projectId);
  if (!auth) {
    throw fail(CONFLICT, 'The project is not connected to Jira');
  }
  return auth;
}

/**
 * `GET` reads the comments from Jira on each call (the tab reads them once per opening, and on
 * Refresh), with those not posted yet. `POST` (`{ text, replyTo? }`) queues a comment.
 */
export function ticketJiraCommentRoutes(db: Db, jira: JiraApi): Hono {
  const routes = new Hono();
  routes.get('/:id/jira-comments', async (c) => {
    const ticket = loadTicket(db, c);
    const key = issueKeyOf(ticket);
    const auth = authFor(db, ticket);
    const read = await guarded(() => jira.comments(auth, key));
    const view: JiraTabView = {
      key,
      issueUrl: ticket.originUrl ?? `${auth.site}/browse/${key}`,
      comments: read.comments,
      total: read.total,
      pending: pendingJiraComments(db, ticket.id),
    };
    return c.json(view);
  });
  routes.post('/:id/jira-comments', async (c) => {
    const ticket = loadTicket(db, c);
    const key = issueKeyOf(ticket);
    authFor(db, ticket);
    const input = await readObject(c.req.raw);
    return c.json({ id: queueJiraComment(db, ticket, key, input) }, ACCEPTED);
  });
  return routes;
}
