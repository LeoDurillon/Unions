// A ticket's Notion page as its tab reads it: which page, its title, status, edit time, properties, changes being sent.

import type { Db, NotionApi, Ticket } from '@union/core';

import { CONFLICT, fail } from './http';
import { pendingTrackerFields, withNotionOptions } from './tracker-field-commands';
import type { NotionItemView } from './tracker-item-types';

const NOT_LINKED = 'This ticket is not linked to a Notion page';

/** The ticket's page: the one it was imported from, created as, or linked to. */
export function notionPageOf(ticket: Ticket): { id: string; url: string } {
  if (ticket.originKind !== 'notion' || !ticket.originId) {
    throw fail(CONFLICT, NOT_LINKED);
  }
  const url = ticket.originUrl ?? `https://www.notion.so/${ticket.originId.replaceAll('-', '')}`;
  return { id: ticket.originId, url };
}

/**
 * The page's title, status, last edit and properties (with the data source's options), null when
 * Notion does not give the page (the tab shows the rest); and the properties still being set.
 */
export async function notionPageView(
  db: Db,
  notion: NotionApi,
  token: string,
  ticket: Ticket,
): Promise<Pick<NotionItemView, 'page' | 'pendingFields'>> {
  const pendingFields = pendingTrackerFields(db, ticket.id);
  try {
    const page = await notion.page(token, notionPageOf(ticket).id);
    return {
      page: {
        title: page.title,
        status: page.status ?? null,
        editedAt: page.editedAt ?? null,
        properties: withNotionOptions(db, ticket.projectId, page.properties ?? []),
      },
      pendingFields,
    };
  } catch {
    return { page: null, pendingFields };
  }
}
