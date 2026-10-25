// Replies to a pull request's comments, as the web hands them to the worker: a reply queued, a suggestion edited, sent or discarded.
import {
  replyBodyProblem,
  schema,
  type Db,
  type PrCommentReply,
  type ReviewComment,
  type Ticket,
} from '@union/core';
import { and, eq } from 'drizzle-orm';

import { BAD_REQUEST, CONFLICT, fail, NOT_FOUND } from './http';
import { commentPullRequest } from './pr-replies';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Command = typeof schema.commands.$inferSelect;

/** The body as GitHub gets it, refused empty or too long. */
export function checkedBody(body: unknown): string {
  const text = typeof body === 'string' ? body.trim() : '';
  const problem = replyBodyProblem(text);
  if (problem !== null) {
    throw fail(BAD_REQUEST, problem);
  }
  return text;
}

/** Queues a reply for the worker to post; the command row is the reply until its event comes. */
export function queueReply(db: Db | Tx, reply: PrCommentReply): Command {
  return db
    .insert(schema.commands)
    .values({ type: 'reply_pr_comment', ticketId: reply.ticketId, payload: reply })
    .returning()
    .get();
}

/** The ticket's suggested reply on `commentId`, still a draft. */
function draftSuggestion(db: Db, ticket: Ticket, commentId: number): ReviewComment {
  const comment = db
    .select()
    .from(schema.reviewComments)
    .where(
      and(eq(schema.reviewComments.id, commentId), eq(schema.reviewComments.ticketId, ticket.id)),
    )
    .get();
  if (!comment || comment.replyBody === null || comment.githubUrl === null) {
    throw fail(NOT_FOUND, 'No suggested reply on this comment');
  }
  if (comment.replyStatus !== 'draft') {
    throw fail(CONFLICT, 'This reply is not a draft any more');
  }
  return comment;
}

/** Edits a suggestion's text or its resolve box; edited, it is the user's. */
export function editSuggestion(
  db: Db,
  ticket: Ticket,
  commentId: number,
  change: { body?: unknown; resolve?: unknown },
): void {
  const comment = draftSuggestion(db, ticket, commentId);
  db.update(schema.reviewComments)
    .set({
      ...(change.body === undefined
        ? {}
        : { replyBody: checkedBody(change.body), replyAuthor: 'user' }),
      ...(typeof change.resolve === 'boolean' ? { replyResolve: change.resolve } : {}),
    })
    .where(eq(schema.reviewComments.id, comment.id))
    .run();
}

export function discardSuggestion(db: Db, ticket: Ticket, commentId: number): void {
  const comment = draftSuggestion(db, ticket, commentId);
  db.update(schema.reviewComments)
    .set({ replyStatus: 'discarded' })
    .where(eq(schema.reviewComments.id, comment.id))
    .run();
}

function sendOne(db: Db, tx: Tx, ticket: Ticket, comment: ReviewComment): void {
  const number = commentPullRequest(db, ticket, comment);
  if (number === null) {
    throw fail(CONFLICT, 'Link a pull request to this ticket first');
  }
  tx.update(schema.reviewComments)
    .set({ replyStatus: 'sending', replyError: null })
    .where(eq(schema.reviewComments.id, comment.id))
    .run();
  queueReply(tx, {
    projectId: ticket.projectId,
    number,
    target: { kind: 'comment', commentId: comment.id },
    body: checkedBody(comment.replyBody),
    resolve: comment.kind === 'line' && comment.replyResolve,
    reviewId: null,
    ticketId: ticket.id,
  });
}

/** Sends suggestions to the worker, one command each, all or none; returns how many. */
export function sendSuggestions(db: Db, ticket: Ticket, commentIds: readonly number[]): number {
  const comments = commentIds.map((id) => draftSuggestion(db, ticket, id));
  db.transaction((tx) => {
    for (const comment of comments) {
      sendOne(db, tx, ticket, comment);
    }
  });
  return comments.length;
}

/** The ticket's draft suggestions on pull request `number`, for Send all. */
export function draftIds(db: Db, ticket: Ticket, number: number): number[] {
  return db
    .select()
    .from(schema.reviewComments)
    .where(
      and(
        eq(schema.reviewComments.ticketId, ticket.id),
        eq(schema.reviewComments.replyStatus, 'draft'),
      ),
    )
    .all()
    .filter((comment) => commentPullRequest(db, ticket, comment) === number)
    .map((comment) => comment.id);
}
