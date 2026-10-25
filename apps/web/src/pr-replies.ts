// The replies of a pull request as the UI reads them: those the worker has not posted yet, the implementer's suggestions, and who posts.
import {
  getGitHubApp,
  isEvent,
  listSlices,
  projectGitHubAuth,
  replyOf,
  schema,
  type Db,
  type PrCommentReply,
  type Project,
  type ReviewComment,
  type Ticket,
} from '@union/core';
import { and, eq, gte, inArray, isNull } from 'drizzle-orm';

import type { PendingReply, RepliesResponse, SuggestedReply } from './reply-api-types';

/** A reply still unanswered after this is no longer shown pending: the worker stopped while posting it. */
const STALE_REPLY_MS = 600_000;

/** The reply a command carries; null for a payload the worker refuses too. */
function readReply(payload: unknown): PrCommentReply | null {
  try {
    return replyOf(payload);
  } catch {
    return null;
  }
}

/** The commands whose `pr_comment_replied` or `_failed` is logged since `since`. */
function answered(db: Db, since: number): Set<number> {
  const events = db
    .select()
    .from(schema.events)
    .where(
      and(
        inArray(schema.events.type, ['pr_comment_replied', 'pr_comment_reply_failed']),
        gte(schema.events.at, since),
      ),
    )
    .all();
  return new Set(
    events.flatMap((event) =>
      isEvent(event, 'pr_comment_replied') || isEvent(event, 'pr_comment_reply_failed')
        ? [event.payload.commandId]
        : [],
    ),
  );
}

/** The user's replies (not suggestions) to the pull request's threads and notes that GitHub has not answered yet. */
function pendingReplies(
  db: Db,
  pull: { projectId: number; number: number },
  now = Date.now(),
): PendingReply[] {
  const since = now - STALE_REPLY_MS;
  const commands = db
    .select()
    .from(schema.commands)
    .where(
      and(
        eq(schema.commands.type, 'reply_pr_comment'),
        gte(schema.commands.createdAt, since),
        isNull(schema.commands.error),
      ),
    )
    .all();
  const done = answered(db, since);
  return commands.flatMap((command) => {
    const reply = readReply(command.payload);
    const { target } = reply ?? {};
    const ours = reply?.projectId === pull.projectId && reply.number === pull.number;
    if (!ours || done.has(command.id) || !target || target.kind === 'comment') {
      return [];
    }
    return [{ commandId: command.id, target, body: reply.body, createdAt: command.createdAt }];
  });
}

/** The pull request an imported comment came from: its slice's, else the ticket's. */
export function commentPullRequest(db: Db, ticket: Ticket, comment: ReviewComment): number | null {
  if (comment.slicePosition === null) {
    return ticket.prNumber;
  }
  const slice = listSlices(db, ticket.id).find((one) => one.position === comment.slicePosition);
  return slice?.prNumber ?? ticket.prNumber;
}

function suggestionOf(comment: ReviewComment): SuggestedReply[] {
  const { githubUrl, replyBody, replyStatus } = comment;
  if (githubUrl === null || replyBody === null) {
    return [];
  }
  if (replyStatus !== 'draft' && replyStatus !== 'sending') {
    return [];
  }
  return [
    {
      commentId: comment.id,
      githubUrl,
      kind: comment.kind,
      body: replyBody,
      resolve: comment.replyResolve,
      status: replyStatus,
      author: comment.replyAuthor ?? 'agent',
      error: comment.replyError,
    },
  ];
}

/** The ticket's suggested replies on pull request `number`, drafts and those being sent. */
function suggestedReplies(db: Db, ticket: Ticket, number: number): SuggestedReply[] {
  return db
    .select()
    .from(schema.reviewComments)
    .where(
      and(
        eq(schema.reviewComments.ticketId, ticket.id),
        inArray(schema.reviewComments.replyStatus, ['draft', 'sending']),
      ),
    )
    .orderBy(schema.reviewComments.id)
    .all()
    .filter((comment) => commentPullRequest(db, ticket, comment) === number)
    .flatMap((comment) => suggestionOf(comment));
}

/** Who a reply posts as, from the project's credentials, without asking GitHub. */
function poster(db: Db, project: Project): { postsAs: string; canPost: boolean } {
  const auth = projectGitHubAuth(db, project, process.env.GITHUB_TOKEN);
  if (!auth) {
    return {
      postsAs:
        'This project has no GitHub credentials: set a token or a GitHub App in its settings',
      canPost: false,
    };
  }
  const slug = auth.kind === 'app' ? getGitHubApp(db)?.slug : undefined;
  return {
    postsAs: slug === undefined ? "Posts with the project's token" : `Posts as @${slug}[bot]`,
    canPost: true,
  };
}

/** The replies of pull request `number`: pending, suggested (a ticket's only), and who posts. */
export function repliesOf(
  db: Db,
  project: Project,
  pull: { number: number; ticket: Ticket | null },
): RepliesResponse {
  const { number, ticket } = pull;
  return {
    number,
    pending: pendingReplies(db, { projectId: project.id, number }),
    suggested: ticket ? suggestedReplies(db, ticket, number) : [],
    ...poster(db, project),
  };
}
