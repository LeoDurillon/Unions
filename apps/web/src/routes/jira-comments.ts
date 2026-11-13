// `/api/tickets/:id/jira-comments`: the Jira issue a ticket was imported from and its comments, read
// now. Also those the user sends to it, posted by the worker.

import type { Db, JiraApi } from '@union/core';
import { Hono } from 'hono';

import { ACCEPTED, CONFLICT, fail, NOT_FOUND, readObject } from '../http';
import { pendingJiraComments, queueJiraComment } from '../jira-comment-commands';
import type { JiraTabView } from '../jira-comment-types';
import { jiraAuthFor, jiraIssueKeyOf, jiraIssueView } from '../jira-issue-view';
import { importedJiraComments, importJiraComment } from '../jira-review-import';
import { reviewImportRefusal } from '../review-import-refusal';
import { guarded } from './notion';
import { loadTicket } from './tickets/ticket-notion-link';

/**
 * `GET` reads the issue and its comments from Jira on each call (the tab reads them once per opening, and on
 * Refresh), with those not posted yet and those in the review. `POST` (`{ text, replyTo? }`) queues a
 * comment; `POST /import` (`{ commentId }`) adds one to the review.
 */
export function ticketJiraCommentRoutes(db: Db, jira: JiraApi): Hono {
  const routes = new Hono();
  routes.get('/:id/jira-comments', async (c) => {
    const ticket = loadTicket(db, c);
    const key = jiraIssueKeyOf(ticket);
    const auth = jiraAuthFor(db, ticket);
    const [read, issue] = await Promise.all([
      guarded(() => jira.comments(auth, key)),
      jiraIssueView(db, jira, auth, ticket),
    ]);
    const view: JiraTabView = {
      key,
      issueUrl: ticket.originUrl ?? `${auth.site}/browse/${key}`,
      ...issue,
      comments: read.comments,
      total: read.total,
      pending: pendingJiraComments(db, ticket.id),
      review: {
        importedIds: importedJiraComments(
          db,
          ticket.id,
          { site: auth.site, key },
          read.comments.map((comment) => comment.id),
        ),
        refusal: reviewImportRefusal(ticket),
      },
    };
    return c.json(view);
  });
  routes.post('/:id/jira-comments/import', async (c) => {
    const ticket = loadTicket(db, c);
    const key = jiraIssueKeyOf(ticket);
    const refusal = reviewImportRefusal(ticket);
    if (refusal !== null) {
      throw fail(CONFLICT, refusal);
    }
    const auth = jiraAuthFor(db, ticket);
    const { commentId } = await readObject(c.req.raw);
    // Read again: the comment as it is now.
    const read = await guarded(() => jira.comments(auth, key));
    const comment = read.comments.find((one) => one.id === commentId);
    if (!comment) {
      throw fail(NOT_FOUND, 'This comment is not on the issue any more');
    }
    return c.json({ imported: importJiraComment(db, ticket, { site: auth.site, key }, comment) });
  });
  routes.post('/:id/jira-comments', async (c) => {
    const ticket = loadTicket(db, c);
    const key = jiraIssueKeyOf(ticket);
    jiraAuthFor(db, ticket);
    const input = await readObject(c.req.raw);
    return c.json({ id: queueJiraComment(db, ticket, key, input) }, ACCEPTED);
  });
  return routes;
}
