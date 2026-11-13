// A Jira issue's comments as tracker threads (a thread of one each: Jira has none), and a comment posted to it.
// A reply is a new comment that mentions the author first.

import { withLeadingMention } from './adf-mention';
import type { JiraApi, JiraAuth } from './jira-api';
import type { JiraComment } from './jira-comments';
import { JiraError } from './jira-error';
import { markdownAdf } from './markdown-adf';
import type { TrackerCommentInput, TrackerThread, TrackerThreads } from './tracker-comments';

const FORBIDDEN = 403;
const NOT_FOUND = 404;

function threadOf(comment: JiraComment): TrackerThread {
  return {
    id: comment.id,
    place: 'item',
    quote: null,
    url: comment.url,
    comments: [
      {
        id: comment.id,
        author: comment.author,
        createdAt: comment.created,
        edited: comment.edited,
        restriction: comment.restriction,
        markdown: comment.markdown,
        url: comment.url,
        // An app's or anonymized author has no account to mention: a reply is a new comment then.
        mention:
          comment.accountId === null
            ? null
            : { accountId: comment.accountId, name: comment.author },
      },
    ],
  };
}

/** The issue's comments, the latest Jira gives; `total` counts those left out. */
export async function jiraThreads(
  jira: JiraApi,
  auth: JiraAuth,
  key: string,
): Promise<TrackerThreads> {
  const page = await jira.comments(auth, key);
  return { threads: page.comments.map(threadOf), total: page.total, truncated: false };
}

/** A new comment on the issue, its markdown as Jira's rich text, the mention first when it replies. */
export async function postJiraThreadComment(
  jira: JiraApi,
  auth: JiraAuth,
  post: TrackerCommentInput,
): Promise<{ commentId: string }> {
  const body = markdownAdf(post.text);
  const created = await jira.addComment(
    auth,
    post.itemId,
    post.mention ? withLeadingMention(body, post.mention) : body,
  );
  return { commentId: created.id };
}

/** Jira's reason, with the permission named when it refused one. */
export function jiraPostFailure(error: unknown): string {
  if (error instanceof JiraError && error.status === FORBIDDEN) {
    return 'Jira refused it: the account needs the "Add comments" permission in the Jira project';
  }
  if (error instanceof JiraError && error.status === NOT_FOUND) {
    return 'Jira did not find the issue: it may have been moved or deleted';
  }
  return error instanceof Error ? error.message : String(error);
}
