// Comments on a ticket's Notion page as the web hands them to the worker: one queued, and those not posted yet.
import {
  isEvent,
  notionCommentOf,
  notionCommentProblem,
  schema,
  type Db,
  type NotionCommentPost,
  type Ticket,
} from '@union/core';
import { and, eq, gte, inArray, isNull } from 'drizzle-orm';

import { BAD_REQUEST, fail } from './http';
import type { PendingNotionComment } from './notion-discussion-types';

/** A comment still unanswered after this is no longer shown pending: the worker stopped while posting it. */
const STALE_COMMENT_MS = 600_000;

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

/** The commands whose `notion_comment_posted` or `_failed` is logged on the ticket since `since`. */
function answered(db: Db, ticketId: number, since: number): Set<number> {
  const events = db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.ticketId, ticketId),
        inArray(schema.events.type, ['notion_comment_posted', 'notion_comment_failed']),
        gte(schema.events.at, since),
      ),
    )
    .all();
  return new Set(
    events.flatMap((event) =>
      isEvent(event, 'notion_comment_posted') || isEvent(event, 'notion_comment_failed')
        ? [event.payload.commandId]
        : [],
    ),
  );
}

function postOf(payload: unknown): NotionCommentPost | null {
  try {
    return notionCommentOf(payload);
  } catch {
    return null;
  }
}

/** The ticket's comments the worker has not posted yet ("Sending…" in the tab, across reloads). */
export function pendingNotionComments(
  db: Db,
  ticketId: number,
  now = Date.now(),
): PendingNotionComment[] {
  const since = now - STALE_COMMENT_MS;
  const commands = db
    .select()
    .from(schema.commands)
    .where(
      and(
        eq(schema.commands.type, 'post_notion_comment'),
        eq(schema.commands.ticketId, ticketId),
        gte(schema.commands.createdAt, since),
        isNull(schema.commands.error),
      ),
    )
    .all();
  const done = answered(db, ticketId, since);
  return commands.flatMap((command) => {
    const post = postOf(command.payload);
    if (!post || done.has(command.id)) {
      return [];
    }
    return [
      {
        commandId: command.id,
        discussionId: post.discussionId,
        text: post.text,
        createdAt: command.createdAt,
      },
    ];
  });
}
