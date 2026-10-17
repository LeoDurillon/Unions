import { createTicket, parseNotionId, schema, type Db } from '@union/core';
import type { Context } from 'hono';

import { BAD_REQUEST, CREATED, fail, optionalText, readObject, requireText } from '../http';
import { fetchNotionImages } from '../notion-images';
import { addAttachment } from './attachments';
import { flowOf } from './ticket-flow';
import { findTicket, linkParent, summarize } from './ticket-links';

function notionPageOf(body: Record<string, unknown>): string | null {
  const notionPage = optionalText(body, 'notionPageId');
  const notionPageId = notionPage === undefined ? null : parseNotionId(notionPage);
  if (notionPage !== undefined && notionPageId === null) {
    throw fail(BAD_REQUEST, 'That is not a Notion page ID');
  }
  return notionPageId;
}

/**
 * `POST /api/tickets`. A ticket imported from Notion keeps the page's images as its own files,
 * fetched before it is created (their links expire within the hour), so its text never points to
 * a link about to break.
 */
export async function addTicket(db: Db, c: Context): Promise<Response> {
  const body = await readObject(c.req.raw);
  const projectId = Number(body.projectId);
  const known = db
    .select()
    .from(schema.projects)
    .all()
    .some((row) => row.id === projectId);
  if (!known) {
    throw fail(BAD_REQUEST, 'Unknown project');
  }
  const parentId = typeof body.parentId === 'number' ? body.parentId : null;
  // Checked first: a new ticket can only fail the link through its parent's project.
  if (parentId !== null && findTicket(db)(parentId)?.projectId !== projectId) {
    throw fail(BAD_REQUEST, 'The parent must be a ticket of the same project');
  }
  const notionPageId = notionPageOf(body);
  const flow = flowOf(body) ?? null;
  const text = optionalText(body, 'body') ?? '';
  const { markdown, images } = notionPageId
    ? await fetchNotionImages(text)
    : { markdown: text, images: [] };
  const ticket = createTicket(db, {
    projectId,
    title: requireText(body, 'title'),
    body: markdown,
    flow,
    ...(notionPageId ? { notionPageId } : {}),
  });
  for (const image of images) {
    // oxlint-disable-next-line no-await-in-loop -- one at a time: each is checked against the ticket's total
    await addAttachment(db, ticket.id, { ...image, note: 'An image of the Notion page' });
  }
  const linked = parentId === null ? ticket : linkParent(db, ticket.id, parentId);
  return c.json(summarize(linked, findTicket(db)), CREATED);
}
