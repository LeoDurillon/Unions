// A comment on a ticket's Jira issue, as the web queues it (`post_jira_comment`) and the worker posts it; browser-safe.
import { isRecord } from './agent-activity';

/** Jira refuses longer comments. */
const MAX_JIRA_COMMENT = 32_767;

/** The comment a reply answers, and its author to mention: Jira comments have no threads. */
export type JiraReplyTo = { commentId: string; accountId: string; name: string };

/** The payload of a `post_jira_comment` command: a new comment on the issue, a reply when `replyTo` is set. */
export type JiraCommentPost = {
  projectId: number;
  ticketId: number;
  key: string;
  text: string;
  replyTo: JiraReplyTo | null;
};

/** Why Jira would refuse the text, or null when it can be sent. */
export function jiraCommentProblem(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 'Write a comment first';
  }
  return trimmed.length > MAX_JIRA_COMMENT
    ? `A comment is at most ${MAX_JIRA_COMMENT.toLocaleString('en')} characters`
    : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** A reply's target as sent; null when it is not one (a new comment). */
export function jiraReplyToOf(value: unknown): JiraReplyTo | null {
  const record = isRecord(value) ? value : {};
  const commentId = nonEmpty(record.commentId);
  const accountId = nonEmpty(record.accountId);
  const name = nonEmpty(record.name);
  return commentId && accountId && name ? { commentId, accountId, name } : null;
}

/** The comment a `post_jira_comment` command carries; throws when the payload is not one. */
export function jiraCommentOf(payload: unknown): JiraCommentPost {
  const record = isRecord(payload) ? payload : {};
  const { projectId, ticketId, text } = record;
  const key = nonEmpty(record.key);
  if (!Number.isInteger(projectId) || !Number.isInteger(ticketId) || key === null) {
    throw new TypeError('post_jira_comment needs a "projectId", a "ticketId" and a "key"');
  }
  if (typeof text !== 'string' || jiraCommentProblem(text) !== null) {
    throw new TypeError('post_jira_comment needs a "text" Jira accepts');
  }
  return {
    projectId: Number(projectId),
    ticketId: Number(ticketId),
    key,
    text: text.trim(),
    replyTo: jiraReplyToOf(record.replyTo),
  };
}
