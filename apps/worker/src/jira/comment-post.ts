// Posts a comment on a ticket's Jira issue, its markdown as Jira's rich text, and logs how it went.
// A reply mentions the comment's author first.
import {
  emitEvent,
  FetchJiraApi,
  jiraAuthOf,
  JiraError,
  markdownAdf,
  withLeadingMention,
  type Db,
  type JiraApi,
  type JiraCommentPost,
} from '@union/core';

import type { CommandHooks } from '../command-hooks';

const FORBIDDEN = 403;
const NOT_FOUND = 404;

type Outcome = { commentId: string } | { error: string };

/** Jira's reason, with the permission named when it refused one. */
function reasonOf(error: unknown): string {
  if (error instanceof JiraError && error.status === FORBIDDEN) {
    return 'Jira refused it: the account needs the "Add comments" permission in the Jira project';
  }
  if (error instanceof JiraError && error.status === NOT_FOUND) {
    return 'Jira did not find the issue: it may have been moved or deleted';
  }
  return error instanceof Error ? error.message : String(error);
}

async function attempt(db: Db, jira: JiraApi, post: JiraCommentPost): Promise<Outcome> {
  const auth = jiraAuthOf(db, post.projectId);
  if (!auth) {
    return { error: 'This project is not connected to Jira' };
  }
  try {
    const body = markdownAdf(post.text);
    const { replyTo } = post;
    const created = await jira.addComment(
      auth,
      post.key,
      replyTo
        ? withLeadingMention(body, { accountId: replyTo.accountId, name: replyTo.name })
        : body,
    );
    return { commentId: created.id };
  } catch (error) {
    return { error: reasonOf(error) };
  }
}

/**
 * Posts the comment of the `post_jira_comment` command `commandId` with the project's Jira token;
 * `jira_comment_posted` or `jira_comment_failed` on the ticket says how it went.
 */
export async function postJiraComment(
  db: Db,
  jira: JiraApi,
  commandId: number,
  post: JiraCommentPost,
): Promise<void> {
  const outcome = await attempt(db, jira, post);
  emitEvent(
    db,
    'error' in outcome
      ? {
          type: 'jira_comment_failed',
          ticketId: post.ticketId,
          payload: {
            commandId,
            replyTo: post.replyTo?.commentId ?? null,
            text: post.text,
            error: outcome.error,
          },
        }
      : {
          type: 'jira_comment_posted',
          ticketId: post.ticketId,
          payload: { commandId, commentId: outcome.commentId },
        },
  );
}

/** The hooks that write to Jira with the project's token, in the background. */
export function jiraHooks(
  db: Db,
  jira: JiraApi = new FetchJiraApi(),
): Pick<CommandHooks, 'postJiraComment'> {
  return {
    postJiraComment: (commandId, post) => {
      void postJiraComment(db, jira, commandId, post);
    },
  };
}
