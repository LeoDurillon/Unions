// `GET /api/tickets/:id/trackers/:kind/item`: the ticket's tracker item for its tab's card, read now.
// Its facts, its properties, the changes being sent. One reader per tracker until the cards share one shape.

import type { Db, JiraApi, NotionApi } from '@union/core';
import { Hono, type Context } from 'hono';

import { jiraAuthFor, jiraIssueView } from '../jira-issue-view';
import { notionPageOf, notionPageView } from '../notion-page-facts';
import { loadTicketTrackerItem } from '../ticket-tracker-item';
import type { TrackerItemView } from '../tracker-item-types';

async function itemView(
  db: Db,
  apis: { notion: NotionApi; jira: JiraApi },
  c: Context,
): Promise<TrackerItemView> {
  const { ticket, kind, item, integration } = loadTicketTrackerItem(db, c);
  if (kind === 'notion') {
    const page = await notionPageView(db, apis.notion, integration.secret, ticket);
    return { kind, pageUrl: notionPageOf(ticket).url, ...page };
  }
  const auth = jiraAuthFor(db, ticket);
  const issue = await jiraIssueView(db, apis.jira, auth, ticket);
  return { kind, key: item.id, issueUrl: item.url ?? `${auth.site}/browse/${item.id}`, ...issue };
}

export function ticketTrackerItemRoutes(db: Db, apis: { notion: NotionApi; jira: JiraApi }): Hono {
  const routes = new Hono();
  routes.get('/:id/trackers/:kind/item', async (c) => c.json(await itemView(db, apis, c)));
  return routes;
}
