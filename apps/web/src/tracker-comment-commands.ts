// Comments on a ticket's tracker item as the web hands them to the worker: one queued, and those not posted yet.
import {
  mentionOf,
  POST_TRACKER_COMMENT,
  schema,
  trackerCommentOf,
  trackerCommentProblem,
  type Db,
  type IntegrationKindName,
  type Ticket,
  type TrackerCommentPost,
} from '@union/core';

import { BAD_REQUEST, fail } from './http';
import { pendingComments, type CommentCommand } from './pending-comments';
import type { PendingTrackerComment } from './tracker-comment-types';

const TRACKER_COMMENTS = {
  type: POST_TRACKER_COMMENT,
  answers: ['tracker_comment_posted', 'tracker_comment_failed'],
  parse: trackerCommentOf,
} as const satisfies CommentCommand<TrackerCommentPost>;

/** Queues a comment for the worker: a reply in `threadId` (`mention` first, where replies mention), else a new one. */
export function queueTrackerComment(
  db: Db,
  ticket: Ticket,
  item: { kind: IntegrationKindName; id: string },
  input: { threadId?: unknown; mention?: unknown; text?: unknown },
): number {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const problem = trackerCommentProblem(item.kind, text);
  if (problem !== null) {
    throw fail(BAD_REQUEST, problem);
  }
  const payload: TrackerCommentPost = {
    projectId: ticket.projectId,
    ticketId: ticket.id,
    kind: item.kind,
    itemId: item.id,
    threadId: typeof input.threadId === 'string' && input.threadId !== '' ? input.threadId : null,
    mention: mentionOf(input.mention),
    text,
  };
  return db
    .insert(schema.commands)
    .values({ type: TRACKER_COMMENTS.type, ticketId: ticket.id, payload })
    .returning()
    .get().id;
}

/** The ticket's comments to `kind` the worker has not posted yet ("Sending…" in the tab, across reloads). */
export function pendingTrackerComments(
  db: Db,
  ticketId: number,
  kind: IntegrationKindName,
  now = Date.now(),
): PendingTrackerComment[] {
  return pendingComments(db, ticketId, TRACKER_COMMENTS, now)
    .filter(({ post }) => post.kind === kind)
    .map(({ commandId, createdAt, post }) => ({
      commandId,
      threadId: post.threadId,
      text: post.text,
      createdAt,
    }));
}
