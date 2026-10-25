// Where a reply to a pull request comment goes on GitHub: a line thread checked to be on that pull request, or its conversation.
import { schema, type Db, type PrCommentReply, type ReviewComment } from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, RepoRef } from './api';

/** A reply in a line thread (its node id), or a new conversation comment on the pull request. */
export type ReplyPlace = { kind: 'thread'; threadId: string } | { kind: 'conversation' };

const GONE = 'The thread is gone on GitHub';

/** The project a review comment belongs to, through its ticket or its pull request under review. */
function commentProject(db: Db, comment: ReviewComment): number | null {
  if (comment.ticketId !== null) {
    return (
      db
        .select({ projectId: schema.tickets.projectId })
        .from(schema.tickets)
        .where(eq(schema.tickets.id, comment.ticketId))
        .get()?.projectId ?? null
    );
  }
  if (comment.reviewId === null) {
    return null;
  }
  return (
    db
      .select({ projectId: schema.currentReviews.projectId })
      .from(schema.currentReviews)
      .where(eq(schema.currentReviews.id, comment.reviewId))
      .get()?.projectId ?? null
  );
}

/** The imported review comment a suggested reply answers; throws when it is not this project's. */
export function repliedComment(db: Db, reply: PrCommentReply, commentId: number): ReviewComment {
  const comment = db
    .select()
    .from(schema.reviewComments)
    .where(eq(schema.reviewComments.id, commentId))
    .get();
  if (!comment || commentProject(db, comment) !== reply.projectId) {
    throw new Error(`Review comment ${commentId} is not one of this project's`);
  }
  if (comment.githubUrl === null) {
    throw new Error('This comment was written in Union: there is nothing to reply to on GitHub');
  }
  return comment;
}

async function checkedThread(
  api: GitHubApi,
  repo: RepoRef,
  reply: PrCommentReply,
  threadId: string,
): Promise<ReplyPlace> {
  const pull = await api.threadPullRequest(threadId);
  if (!pull) {
    throw new Error(GONE);
  }
  const ours = `${repo.owner}/${repo.repo}`.toLowerCase();
  if (pull.repository.toLowerCase() !== ours || pull.number !== reply.number) {
    throw new Error(`This thread is not on pull request #${reply.number}`);
  }
  return { kind: 'thread', threadId };
}

/**
 * Where the reply goes: a thread named by the user (checked on GitHub to be on the project's
 * repository and that pull request), the thread an imported line comment started (found among the
 * pull request's threads, which is the same check), or the conversation.
 */
export async function replyPlace(
  api: GitHubApi,
  repo: RepoRef,
  reply: PrCommentReply,
  comment: ReviewComment | null,
): Promise<ReplyPlace> {
  if (reply.target.kind === 'thread') {
    return checkedThread(api, repo, reply, reply.target.threadId);
  }
  if (comment?.kind !== 'line' || comment.githubUrl === null) {
    return { kind: 'conversation' };
  }
  const threadId = await api.threadOfComment(repo, reply.number, comment.githubUrl);
  if (threadId === null) {
    throw new Error(GONE);
  }
  return { kind: 'thread', threadId };
}
