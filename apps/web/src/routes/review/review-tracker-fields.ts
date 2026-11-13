// `<review>/tracker-fields`: sets one property of a page or issue the review is linked to; the worker sends it.
// Also `<review>/jira/:key/transitions`: the moves a linked issue offers now, for its status.

import {
  jiraAuthOf,
  linkedJiraIssues,
  linkedNotionPages,
  type Db,
  type JiraApi,
  type JiraAuth,
  type NotionApi,
} from '@union/core';
import { Hono } from 'hono';

import { ACCEPTED, BAD_REQUEST, CONFLICT, fail, NOT_FOUND, readObject } from '../../http';
import { trackerFieldInputOf } from '../../tracker-field-input';
import { queueJiraField } from '../../tracker-field-jira';
import { queueNotionField } from '../../tracker-field-notion';
import { guarded } from '../notion';
import { load } from '../pull-requests/pr-review-load';

type Clients = { notion: NotionApi; jira: JiraApi };

function jiraAuth(db: Db, projectId: number): JiraAuth {
  const auth = jiraAuthOf(db, projectId);
  if (!auth) {
    throw fail(CONFLICT, 'The project is not connected to Jira');
  }
  return auth;
}

/** The review's linked items of `kind`; null for a kind that has none. */
function linkedOf(db: Db, reviewId: number, kind: unknown): { id: string }[] | null {
  const owner = { kind: 'review' as const, id: reviewId };
  if (kind === 'jira') {
    return linkedJiraIssues(db, owner);
  }
  return kind === 'notion' ? linkedNotionPages(db, owner) : null;
}

/** The linked item `itemId` of `kind`, refused when the review is not linked to it. */
function linkedItem(db: Db, reviewId: number, kind: unknown, itemId: unknown): string {
  const items = linkedOf(db, reviewId, kind);
  if (items === null || typeof itemId !== 'string') {
    throw fail(BAD_REQUEST, 'Name the Notion page or Jira issue');
  }
  if (!items.some((item) => item.id === itemId)) {
    throw fail(NOT_FOUND, 'The review is not linked to this item any more');
  }
  return itemId;
}

/**
 * `POST /tracker-fields` (`{ kind, itemId, fieldId, value, text, picks? }`): the item is read first,
 * as from a ticket's tab; the change is the review's (no ticket), so its events carry `reviewId`.
 */
export function reviewTrackerFieldRoutes(db: Db, { notion, jira }: Clients): Hono {
  const routes = new Hono();
  routes.post('/tracker-fields', async (c) => {
    const { review, project } = load(db, c);
    const body = await readObject(c.req.raw);
    const itemId = linkedItem(db, review.id, body.kind, body.itemId);
    const input = trackerFieldInputOf(body);
    const target = {
      projectId: project.id,
      itemId,
      place: { ticketId: null, reviewId: review.id },
    };
    const id =
      body.kind === 'jira'
        ? await queueJiraField(db, jira, { auth: jiraAuth(db, project.id), target }, input)
        : await queueNotionField(db, notion, target, input);
    return c.json({ id }, ACCEPTED);
  });
  routes.get('/jira/:key/transitions', async (c) => {
    const { review, project } = load(db, c);
    const key = linkedItem(db, review.id, 'jira', c.req.param('key'));
    const auth = jiraAuth(db, project.id);
    return c.json(await guarded(() => jira.transitions(auth, key)));
  });
  return routes;
}
