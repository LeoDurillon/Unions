// A comment on a ticket's tracker item, as the web queues it (`post_tracker_comment`) and the worker posts it.
// Browser-safe. The worker still reads the commands of the release before (`post_notion_comment`, `post_jira_comment`).

import { isRecord } from '../agent/agent-activity';
import type { MentionTarget } from './adf-mention';
import { jiraCommentOf, jiraCommentProblem } from './jira-comment-post';
import { isIntegrationKindName, type IntegrationKindName } from './kinds';
import { notionCommentOf, notionCommentProblem } from './notion-comment-post';
import type { TrackerCommentInput } from './tracker-comments';

export const POST_TRACKER_COMMENT = 'post_tracker_comment';

/** The payload of a `post_tracker_comment` command: the comment, and the ticket and project it is for. */
export type TrackerCommentPost = TrackerCommentInput & {
  projectId: number;
  ticketId: number;
  kind: IntegrationKindName;
};

const PROBLEMS: Record<IntegrationKindName, (text: string) => string | null> = {
  notion: notionCommentProblem,
  jira: jiraCommentProblem,
};

/** Why the tracker would refuse the text, or null when it can be sent. */
export function trackerCommentProblem(kind: IntegrationKindName, text: string): string | null {
  return PROBLEMS[kind](text);
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** A reply's mention as sent; null when there is none. */
export function mentionOf(value: unknown): MentionTarget | null {
  const record = isRecord(value) ? value : {};
  const accountId = nonEmpty(record.accountId);
  const name = nonEmpty(record.name);
  return accountId && name ? { accountId, name } : null;
}

function kindOf(value: unknown): IntegrationKindName | null {
  return typeof value === 'string' && isIntegrationKindName(value) ? value : null;
}

/** The comment a `post_tracker_comment` command carries; throws when the payload is not one. */
export function trackerCommentOf(payload: unknown): TrackerCommentPost {
  const record = isRecord(payload) ? payload : {};
  const { projectId, ticketId, text } = record;
  const kind = kindOf(record.kind);
  const itemId = nonEmpty(record.itemId);
  if (!Number.isInteger(projectId) || !Number.isInteger(ticketId) || !kind || !itemId) {
    throw new TypeError(
      `${POST_TRACKER_COMMENT} needs a "projectId", a "ticketId", a "kind" and an "itemId"`,
    );
  }
  if (typeof text !== 'string' || trackerCommentProblem(kind, text) !== null) {
    throw new TypeError(`${POST_TRACKER_COMMENT} needs a "text" the tracker accepts`);
  }
  return {
    projectId: Number(projectId),
    ticketId: Number(ticketId),
    kind,
    itemId,
    threadId: nonEmpty(record.threadId),
    mention: mentionOf(record.mention),
    text: text.trim(),
  };
}

/** A `post_notion_comment` command of the release before, as a tracker comment: read for one release. */
export function legacyNotionComment(payload: unknown): TrackerCommentPost {
  const post = notionCommentOf(payload);
  return {
    projectId: post.projectId,
    ticketId: post.ticketId,
    kind: 'notion',
    itemId: post.pageId,
    threadId: post.discussionId,
    mention: null,
    text: post.text,
  };
}

/** A `post_jira_comment` command of the release before, as a tracker comment: read for one release. */
export function legacyJiraComment(payload: unknown): TrackerCommentPost {
  const post = jiraCommentOf(payload);
  const { replyTo } = post;
  return {
    projectId: post.projectId,
    ticketId: post.ticketId,
    kind: 'jira',
    itemId: post.key,
    threadId: replyTo?.commentId ?? null,
    mention: replyTo ? { accountId: replyTo.accountId, name: replyTo.name } : null,
    text: post.text,
  };
}
