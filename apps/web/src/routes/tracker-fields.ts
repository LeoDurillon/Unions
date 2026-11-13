// `/api/tickets/:id/tracker-fields`: sets one property of the ticket's Notion page or Jira issue; the worker sends it.

import type { Db, JiraApi, NotionApi } from '@union/core';
import { Hono } from 'hono';

import { ACCEPTED, CONFLICT, fail, readObject } from '../http';
import { queueFieldChange, trackerFieldInputOf } from '../tracker-field-input';
import { loadTicket } from './tickets/ticket-load';

/**
 * `POST` (`{ fieldId, value, text, picks? }`): the item is read first, so the property's type is the
 * tracker's now, and the value is checked as the worker will send it.
 */
export function ticketTrackerFieldRoutes(db: Db, notion: NotionApi, jira: JiraApi): Hono {
  const routes = new Hono();
  routes.post('/:id/tracker-fields', async (c) => {
    const ticket = loadTicket(db, c);
    const input = trackerFieldInputOf(await readObject(c.req.raw));
    const { originKind: kind, originId: itemId } = ticket;
    if (kind === null || itemId === null) {
      throw fail(CONFLICT, 'This ticket is not linked to a Notion page or a Jira issue');
    }
    const place = { ticketId: ticket.id, reviewId: null };
    const target = { kind, projectId: ticket.projectId, itemId, place };
    const id = await queueFieldChange(db, { notion, jira }, target, input);
    return c.json({ id }, ACCEPTED);
  });
  return routes;
}
