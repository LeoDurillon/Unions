// `GET /api/tickets/:id/trackers/:kind/item`: the ticket's tracker item for its tab's card, read now.
// Its facts and properties, the changes being sent; `GET …/moves`: the moves it offers now, for its status.

import { trackerAdapter, type Db, type IntegrationApis } from '@union/core';
import { Hono, type Context } from 'hono';

import { NOT_FOUND, fail } from '../http';
import { loadTicketTrackerItem } from '../ticket-tracker-item';
import { pendingTrackerFields } from '../tracker-field-commands';
import type { TrackerItemView } from '../tracker-item-types';
import { guarded } from './tracker-errors';

async function itemView(db: Db, apis: IntegrationApis, c: Context): Promise<TrackerItemView> {
  const { ticket, kind, item, integration } = loadTicketTrackerItem(db, c);
  const adapter = trackerAdapter(kind, apis);
  const facts = adapter.fields
    ? await adapter.fields.read(integration, item.id).catch(() => null)
    : null;
  return {
    kind,
    itemId: item.id,
    url: item.url ?? adapter.refs?.url(item.id, integration.config) ?? '',
    item: facts,
    pendingFields: pendingTrackerFields(db, ticket.id),
  };
}

export function ticketTrackerItemRoutes(db: Db, apis: IntegrationApis): Hono {
  const routes = new Hono();
  routes.get('/:id/trackers/:kind/item', async (c) => c.json(await itemView(db, apis, c)));
  routes.get('/:id/trackers/:kind/moves', async (c) => {
    const { kind, item, integration } = loadTicketTrackerItem(db, c);
    const { fields } = trackerAdapter(kind, apis);
    if (!fields?.moves) {
      throw fail(NOT_FOUND, 'This tracker has no moves');
    }
    return c.json(await guarded(() => fields.moves?.(integration, item.id) ?? Promise.resolve([])));
  });
  return routes;
}
