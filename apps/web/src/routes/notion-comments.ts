// `/api/tickets/:id/notion-comments`: the open discussions of the ticket's Notion page, read now.
import type { Db, NotionApi, Ticket } from '@union/core';
import { Hono } from 'hono';

import { CONFLICT, fail } from '../http';
import { readDiscussions } from '../notion-discussions';
import { notionTokenOf } from './notion';
import { loadTicket } from './ticket-notion-link';

const NOT_LINKED = 'This ticket is not linked to a Notion page';

/** The ticket's page: the one it was imported from, created as, or linked to. */
function pageOf(ticket: Ticket): { id: string; url: string } {
  if (ticket.originKind !== 'notion' || !ticket.originId) {
    throw fail(CONFLICT, NOT_LINKED);
  }
  const url = ticket.originUrl ?? `https://www.notion.so/${ticket.originId.replaceAll('-', '')}`;
  return { id: ticket.originId, url };
}

/** `GET` reads the discussions from Notion on each call: the tab reads once per opening. */
export function ticketNotionCommentRoutes(db: Db, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.get('/:id/notion-comments', async (c) => {
    const ticket = loadTicket(db, c);
    const page = pageOf(ticket);
    const token = notionTokenOf(db, ticket.projectId);
    return c.json(await readDiscussions(notion, token, page));
  });
  return routes;
}
