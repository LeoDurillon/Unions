// `/api/tickets/:id/notion`: links a ticket to its Notion page after creation, or unlinks it.
import { setTicketOrigin, type Db, type NotionApi, type Ticket } from '@union/core';
import { Hono, type Context } from 'hono';

import { NOT_FOUND, fail, readObject, requireId } from '../http';
import type { ReviewNotionLink } from '../review-notion-types';
import { guarded, notionTokenOf, requireNotionId } from './notion';
import { findTicket } from './ticket-links';

function load(db: Db, c: Context): Ticket {
  const id = requireId(c.req.param('id'), 'ticket id');
  const ticket = findTicket(db)(id);
  if (!ticket) {
    throw fail(NOT_FOUND, `Ticket ${id} not found`);
  }
  return ticket;
}

/** `{ page }`, read through the project's integration: reading it is the check that it is shared. */
async function readPage(db: Db, notion: NotionApi, c: Context): Promise<ReviewNotionLink> {
  const ticket = load(db, c);
  const pageId = requireNotionId(await readObject(c.req.raw), 'page', 'page');
  const token = notionTokenOf(db, ticket.projectId);
  const page = await guarded(() => notion.page(token, pageId));
  return { pageId: page.id, title: page.title || 'Untitled Notion page', url: page.url };
}

/** The page becomes the ticket's origin, as if imported from it; its description is kept as written. */
async function link(db: Db, notion: NotionApi, c: Context): Promise<Response> {
  const found = await readPage(db, notion, c);
  setTicketOrigin(db, load(db, c).id, { kind: 'notion', id: found.pageId, url: found.url });
  return c.json(found);
}

/** Forgets the link; the page itself is left untouched in Notion. */
function unlink(db: Db, c: Context): Response {
  setTicketOrigin(db, load(db, c).id, null);
  return c.json({ ok: true });
}

/** `POST /check` reads a page before linking it, `PUT` links it, `DELETE` unlinks it. */
export function ticketNotionRoutes(db: Db, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.post('/:id/notion/check', async (c) => c.json(await readPage(db, notion, c)));
  routes.put('/:id/notion', (c) => link(db, notion, c));
  routes.delete('/:id/notion', (c) => unlink(db, c));
  return routes;
}
