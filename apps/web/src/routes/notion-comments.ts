// `/api/tickets/:id/notion-comments`: the open discussions of the ticket's Notion page, read now, and the comments the user sends to it.
import type { Db, NotionApi, Ticket } from '@union/core';
import { Hono } from 'hono';

import { ACCEPTED, CONFLICT, fail, NOT_FOUND, readObject } from '../http';
import { pendingNotionComments, queueNotionComment } from '../notion-comment-commands';
import { readDiscussions } from '../notion-discussions';
import { importedDiscussions, importNotionDiscussion } from '../notion-review-import';
import { reviewImportRefusal } from '../review-import-refusal';
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

/**
 * `GET` reads the discussions from Notion on each call (the tab reads once per opening), with the
 * comments not posted yet and those in the review. `POST` (`{ discussionId?, text }`) queues a
 * reply or a page comment; `POST /import` (`{ discussionId }`) adds a discussion to the review.
 */
export function ticketNotionCommentRoutes(db: Db, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.get('/:id/notion-comments', async (c) => {
    const ticket = loadTicket(db, c);
    const page = pageOf(ticket);
    const token = notionTokenOf(db, ticket.projectId);
    const view = await readDiscussions(notion, token, page);
    const ids = view.discussions.map((discussion) => discussion.id);
    return c.json({
      ...view,
      pending: pendingNotionComments(db, ticket.id),
      review: {
        importedIds: importedDiscussions(db, ticket.id, page.id, ids),
        refusal: reviewImportRefusal(ticket),
      },
    });
  });
  routes.post('/:id/notion-comments/import', async (c) => {
    const ticket = loadTicket(db, c);
    const page = pageOf(ticket);
    const refusal = reviewImportRefusal(ticket);
    if (refusal !== null) {
      throw fail(CONFLICT, refusal);
    }
    const { discussionId } = await readObject(c.req.raw);
    // Read again: the thread as it is now, replies included.
    const view = await readDiscussions(notion, notionTokenOf(db, ticket.projectId), page);
    const discussion = view.discussions.find((one) => one.id === discussionId);
    if (!discussion) {
      throw fail(NOT_FOUND, 'This discussion is not open on the page any more');
    }
    return c.json({ imported: importNotionDiscussion(db, ticket, page.id, discussion) });
  });
  routes.post('/:id/notion-comments', async (c) => {
    const ticket = loadTicket(db, c);
    const page = pageOf(ticket);
    notionTokenOf(db, ticket.projectId);
    const input = await readObject(c.req.raw);
    return c.json({ id: queueNotionComment(db, ticket, page.id, input) }, ACCEPTED);
  });
  return routes;
}
