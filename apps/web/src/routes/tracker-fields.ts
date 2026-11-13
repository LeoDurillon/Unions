// `/api/tickets/:id/tracker-fields`: sets one property of the ticket's Notion page or Jira issue; the worker sends it.
// Also `GET /:id/jira-transitions`: the moves the ticket's Jira issue offers now, for its status.

import type { Db, JiraApi, NotionApi } from '@union/core';
import { Hono } from 'hono';

import { ACCEPTED, CONFLICT, fail, readObject } from '../http';
import { jiraAuthFor, jiraIssueKeyOf } from '../jira-issue-view';
import { notionPageOf } from '../notion-page-facts';
import { trackerFieldInputOf } from '../tracker-field-input';
import { queueJiraField } from '../tracker-field-jira';
import { queueNotionField } from '../tracker-field-notion';
import { guarded } from './notion';
import { loadTicket } from './tickets/ticket-notion-link';

/**
 * `POST` (`{ fieldId, value, text, picks? }`): the item is read first, so the property's type is the
 * tracker's now, and the value is checked as the worker will send it.
 */
export function ticketTrackerFieldRoutes(db: Db, notion: NotionApi, jira: JiraApi): Hono {
  const routes = new Hono();
  routes.post('/:id/tracker-fields', async (c) => {
    const ticket = loadTicket(db, c);
    const input = trackerFieldInputOf(await readObject(c.req.raw));
    const place = { ticketId: ticket.id, reviewId: null };
    if (ticket.originKind === 'notion') {
      const itemId = notionPageOf(ticket).id;
      const target = { projectId: ticket.projectId, itemId, place };
      return c.json({ id: await queueNotionField(db, notion, target, input) }, ACCEPTED);
    }
    if (ticket.originKind === 'jira') {
      const target = { projectId: ticket.projectId, itemId: jiraIssueKeyOf(ticket), place };
      const auth = jiraAuthFor(db, ticket);
      return c.json({ id: await queueJiraField(db, jira, { auth, target }, input) }, ACCEPTED);
    }
    throw fail(CONFLICT, 'This ticket is not linked to a Notion page or a Jira issue');
  });
  routes.get('/:id/jira-transitions', async (c) => {
    const ticket = loadTicket(db, c);
    const key = jiraIssueKeyOf(ticket);
    const auth = jiraAuthFor(db, ticket);
    return c.json(await guarded(() => jira.transitions(auth, key)));
  });
  return routes;
}
