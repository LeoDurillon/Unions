// Posts a reply to a pull request comment on GitHub (a line thread's reply, or a conversation comment) and logs how it went.
import {
  emitEvent,
  schema,
  type Db,
  type PrCommentReply,
  type Project,
  type ReviewComment,
} from '@union/core';
import { and, eq } from 'drizzle-orm';

import { loadProject } from '../review';
import type { GitHubApi } from './api';
import { repliedComment, replyPlace } from './pr-comment-reply-target';

const FORBIDDEN = 403;
/** GitHub's GraphQL answers a missing permission with this error, not a 403. */
const NOT_ACCESSIBLE = 'Resource not accessible';

type Outcome = { url: string; resolveError: string | null } | { error: string };

/** GitHub's reason, with the permission named when it refused one. */
function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
  if (status === FORBIDDEN || message.includes(NOT_ACCESSIBLE)) {
    return 'GitHub refused it: the GitHub App needs Pull requests read and write (accepted on its installation), a token write access to the repository';
  }
  return message;
}

/** The ticket whose pull request this is, so its log and the PR tab see the reply. */
function ticketOf(db: Db, reply: PrCommentReply): number | undefined {
  if (reply.ticketId !== null) {
    return reply.ticketId;
  }
  return db
    .select({ id: schema.tickets.id })
    .from(schema.tickets)
    .where(
      and(eq(schema.tickets.projectId, reply.projectId), eq(schema.tickets.prNumber, reply.number)),
    )
    .get()?.id;
}

async function post(
  db: Db,
  apiFor: (project: Project) => GitHubApi | null,
  reply: PrCommentReply,
  comment: ReviewComment | null,
): Promise<{ url: string; resolveError: string | null }> {
  const project = loadProject(db, reply.projectId);
  const api = apiFor(project);
  if (!api) {
    throw new Error('This project has no GitHub credentials');
  }
  const repo = { owner: project.owner, repo: project.repo };
  const place = await replyPlace(api, repo, reply, comment);
  if (place.kind === 'conversation') {
    return {
      url: await api.createPullRequestComment(repo, reply.number, reply.body),
      resolveError: null,
    };
  }
  const url = await api.replyToThread(place.threadId, reply.body);
  if (!reply.resolve) {
    return { url, resolveError: null };
  }
  // Posted already: a refused resolve is reported, not a failed reply.
  try {
    await api.resolveThread(place.threadId);
    return { url, resolveError: null };
  } catch (error) {
    return { url, resolveError: reasonOf(error) };
  }
}

async function attempt(
  db: Db,
  apiFor: (project: Project) => GitHubApi | null,
  reply: PrCommentReply,
): Promise<Outcome> {
  try {
    const comment =
      reply.target.kind === 'comment' ? repliedComment(db, reply, reply.target.commentId) : null;
    return await post(db, apiFor, reply, comment);
  } catch (error) {
    return { error: reasonOf(error) };
  }
}

function finish(db: Db, commandId: number, reply: PrCommentReply, outcome: Outcome): void {
  const commentId = reply.target.kind === 'comment' ? reply.target.commentId : null;
  const origin = { commandId, number: reply.number, reviewId: reply.reviewId, commentId };
  db.transaction((tx) => {
    if (commentId !== null) {
      tx.update(schema.reviewComments)
        .set(
          'url' in outcome
            ? { replyStatus: 'sent', replyBody: reply.body, replyError: null }
            : { replyStatus: 'draft', replyError: outcome.error },
        )
        .where(eq(schema.reviewComments.id, commentId))
        .run();
    }
    const ticketId = ticketOf(tx, reply);
    emitEvent(
      tx,
      'url' in outcome
        ? { type: 'pr_comment_replied', ticketId, payload: { ...origin, ...outcome } }
        : {
            type: 'pr_comment_reply_failed',
            ticketId,
            payload: { ...origin, error: outcome.error, body: reply.body },
          },
    );
  });
}

/**
 * Posts the reply of the `reply_pr_comment` command `commandId` with the project's credentials:
 * in its line thread (resolved after, if asked), else as a conversation comment. A suggested
 * reply's row turns sent, or back to a draft with GitHub's reason.
 */
export async function replyToPrComment(
  db: Db,
  apiFor: (project: Project) => GitHubApi | null,
  commandId: number,
  reply: PrCommentReply,
): Promise<void> {
  const outcome = await attempt(db, apiFor, reply);
  finish(db, commandId, reply, outcome);
}
