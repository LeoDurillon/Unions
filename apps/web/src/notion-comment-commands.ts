// Comments on a ticket's Notion page as the web hands them to the worker: one queued, and those not posted yet.
import {
  notionCommentOf,
  notionCommentProblem,
  schema,
  type Db,
  type NotionCommentPost,
  type Ticket,
} from '@union/core';

import { BAD_REQUEST, fail } from './http';
import type { PendingNotionComment } from './notion-discussion-types';
import { pendingComments, type CommentCommand } from './pending-comments';

/** Queues a comment for the worker: a reply in `discussionId`, else a new comment on the page. */
export function queueNotionComment(
  db: Db,
  ticket: Ticket,
  pageId: string,
  input: { discussionId?: unknown; text?: unknown },
): number {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const problem = notionCommentProblem(text);
  if (problem !== null) {
    throw fail(BAD_REQUEST, problem);
  }
  const discussionId =
    typeof input.discussionId === 'string' && input.discussionId !== '' ? input.discussionId : null;
  const payload: NotionCommentPost = {
    projectId: ticket.projectId,
    ticketId: ticket.id,
    pageId,
    discussionId,
    text,
  };
  return db
    .insert(schema.commands)
    .values({ type: 'post_notion_comment', ticketId: ticket.id, payload })
    .returning()
    .get().id;
}

const NOTION_COMMENTS = {
  type: 'post_notion_comment',
  answers: ['notion_comment_posted', 'notion_comment_failed'],
  parse: notionCommentOf,
} as const satisfies CommentCommand<NotionCommentPost>;

/** The ticket's comments the worker has not posted yet ("Sending…" in the tab, across reloads). */
export function pendingNotionComments(
  db: Db,
  ticketId: number,
  now = Date.now(),
): PendingNotionComment[] {
  return pendingComments(db, ticketId, NOTION_COMMENTS, now).map(
    ({ commandId, createdAt, post }) => ({
      commandId,
      discussionId: post.discussionId,
      text: post.text,
      createdAt,
    }),
  );
}
