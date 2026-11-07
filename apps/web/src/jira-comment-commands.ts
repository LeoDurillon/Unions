// Comments on a ticket's Jira issue as the web hands them to the worker: one queued, and those not posted yet.
import {
  jiraCommentOf,
  jiraCommentProblem,
  jiraReplyToOf,
  schema,
  type Db,
  type JiraCommentPost,
  type Ticket,
} from '@union/core';

import { BAD_REQUEST, fail } from './http';
import type { PendingJiraComment } from './jira-comment-types';
import { pendingComments, type CommentCommand } from './pending-comments';

const JIRA_COMMENTS = {
  type: 'post_jira_comment',
  answers: ['jira_comment_posted', 'jira_comment_failed'],
  parse: jiraCommentOf,
} as const satisfies CommentCommand<JiraCommentPost>;

/** Queues a comment for the worker: a new comment on the issue, a reply (a mention of its author) with `replyTo`. */
export function queueJiraComment(
  db: Db,
  ticket: Ticket,
  key: string,
  input: { replyTo?: unknown; text?: unknown },
): number {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const problem = jiraCommentProblem(text);
  if (problem !== null) {
    throw fail(BAD_REQUEST, problem);
  }
  const payload: JiraCommentPost = {
    projectId: ticket.projectId,
    ticketId: ticket.id,
    key,
    text,
    replyTo: jiraReplyToOf(input.replyTo),
  };
  return db
    .insert(schema.commands)
    .values({ type: JIRA_COMMENTS.type, ticketId: ticket.id, payload })
    .returning()
    .get().id;
}

/** The ticket's comments the worker has not posted yet ("Sending…" in the tab, across reloads). */
export function pendingJiraComments(
  db: Db,
  ticketId: number,
  now = Date.now(),
): PendingJiraComment[] {
  return pendingComments(db, ticketId, JIRA_COMMENTS, now).map(
    ({ commandId, createdAt, post }) => ({
      commandId,
      replyTo: post.replyTo?.commentId ?? null,
      text: post.text,
      createdAt,
    }),
  );
}
