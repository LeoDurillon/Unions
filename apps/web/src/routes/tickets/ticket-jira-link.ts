// `/api/tickets/:id/jira`: links a ticket to a Jira issue after creation, or unlinks it; Jira is only read.

import {
  integrationKind,
  integrationOf,
  jiraProvider,
  setTicketOrigin,
  type Db,
  type JiraApi,
} from '@union/core';
import { Hono, type Context } from 'hono';

import { BAD_REQUEST, CONFLICT, fail, readObject, requireText } from '../../http';
import { requireFreeOrigin, requireOrigin } from '../../ticket-origin-guard';
import { guarded } from '../notion';
import { loadTicket } from './ticket-notion-link';

/** An issue found for linking: its key, summary and link. */
export type JiraIssueLink = { key: string; title: string; url: string };

/** The issue `{ issue }` names, read with the project's token: an issue of its Jira project, on its site. */
async function readIssue(db: Db, jira: JiraApi, c: Context): Promise<JiraIssueLink> {
  const ticket = loadTicket(db, c);
  const ref = requireText(await readObject(c.req.raw), 'issue');
  const kind = integrationKind('jira');
  const integration = integrationOf(db, ticket.projectId, 'jira');
  if (!integration) {
    throw fail(CONFLICT, 'The project is not connected to Jira');
  }
  const key = kind.parseRef(ref);
  if (!key) {
    throw fail(BAD_REQUEST, 'That is not a Jira issue key or link');
  }
  const elsewhere = kind.refError?.(ref, integration.config) ?? null;
  if (elsewhere !== null) {
    throw fail(BAD_REQUEST, elsewhere);
  }
  const item = await guarded(() =>
    jiraProvider(jira).item(integration.secret, integration.config, key),
  );
  return { key: item.id, title: item.title || item.id, url: item.url };
}

/** The issue becomes the ticket's origin, as if imported from it; its description is kept as written. */
async function link(db: Db, jira: JiraApi, c: Context): Promise<Response> {
  requireFreeOrigin(loadTicket(db, c), 'jira');
  const found = await readIssue(db, jira, c);
  setTicketOrigin(db, loadTicket(db, c).id, { kind: 'jira', id: found.key, url: found.url });
  return c.json(found);
}

/** Forgets the link; the issue itself is left untouched in Jira. */
function unlink(db: Db, c: Context): Response {
  const ticket = loadTicket(db, c);
  requireOrigin(ticket, 'jira');
  setTicketOrigin(db, ticket.id, null);
  return c.json({ ok: true });
}

/** `POST /check` reads an issue before linking it, `PUT` links it, `DELETE` unlinks it. */
export function ticketJiraLinkRoutes(db: Db, jira: JiraApi): Hono {
  const routes = new Hono();
  routes.post('/:id/jira/check', async (c) => c.json(await readIssue(db, jira, c)));
  routes.put('/:id/jira', (c) => link(db, jira, c));
  routes.delete('/:id/jira', (c) => unlink(db, c));
  return routes;
}
