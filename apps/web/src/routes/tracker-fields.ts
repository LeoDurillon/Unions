// `POST /api/tickets/:id/tracker-fields`: sets one property of the ticket's tracker item; the worker sends it.
// The item is read first, so the property's type is the tracker's now, and the value is checked as the worker will.

import { notionHandValue, notionSchemaOf, type Db, type NotionApi, type Ticket } from '@union/core';
import { Hono } from 'hono';

import { ACCEPTED, BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject } from '../http';
import { notionPageOf } from '../notion-page-facts';
import { queueTrackerField } from '../tracker-field-commands';
import { guarded, notionTokenOf } from './notion';
import { loadTicket } from './tickets/ticket-notion-link';

type Input = { fieldId: string; value: string; text: string };

function inputOf(body: Record<string, unknown>): Input {
  const { fieldId, value, text } = body;
  if (typeof fieldId !== 'string' || fieldId === '' || typeof value !== 'string') {
    throw fail(BAD_REQUEST, 'Name the property and its value');
  }
  return { fieldId, value: value.trim(), text: typeof text === 'string' ? text : value.trim() };
}

/** A property of the ticket's Notion page, read now, checked, then queued. */
async function setNotionField(
  db: Db,
  notion: NotionApi,
  ticket: Ticket,
  input: Input,
): Promise<number> {
  const page = notionPageOf(ticket);
  const token = notionTokenOf(db, ticket.projectId);
  const read = await guarded(() => notion.page(token, page.id));
  const property = read.properties?.find((one) => one.id === input.fieldId);
  if (!property) {
    throw fail(NOT_FOUND, 'This property is not on the Notion page any more: refresh the tab');
  }
  if (!property.settable) {
    throw fail(BAD_REQUEST, `Union cannot set a Notion ${property.type} property`);
  }
  const column = notionSchemaOf(db, ticket.projectId)?.properties.find(
    (one) => one.id === property.id,
  );
  const field = { ...property, options: column?.options ?? [] };
  const shaped = notionHandValue(field, input.value);
  if ('error' in shaped) {
    throw fail(BAD_REQUEST, shaped.error);
  }
  return queueTrackerField(db, {
    projectId: ticket.projectId,
    kind: 'notion',
    itemId: page.id,
    ticketId: ticket.id,
    reviewId: null,
    field: { id: field.id, name: field.name, type: field.type, options: field.options },
    value: input.value,
    text: input.text,
    picks: [],
  });
}

/** `POST` (`{ fieldId, value, text }`): `value` as a rule's value is written, `text` as the user reads it. */
export function ticketTrackerFieldRoutes(db: Db, notion: NotionApi): Hono {
  const routes = new Hono();
  routes.post('/:id/tracker-fields', async (c) => {
    const ticket = loadTicket(db, c);
    const input = inputOf(await readObject(c.req.raw));
    if (ticket.originKind === 'notion' && ticket.originId) {
      return c.json({ id: await setNotionField(db, notion, ticket, input) }, ACCEPTED);
    }
    throw fail(CONFLICT, 'Only a Notion page’s properties can be set from Union for now');
  });
  return routes;
}
