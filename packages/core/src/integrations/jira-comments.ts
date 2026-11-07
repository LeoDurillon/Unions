// A Jira issue's comments as the ticket's Jira tab shows them: author, times, who may see it, text as markdown, link.
import { jiraCommentUrl } from '../jira-comment-link';
import { adfMarkdown } from './adf-markdown';
import { isRecord, text } from './jira-parse';

/** One comment of the issue; `markdown` is its rich text converted, its images and files by name. */
export type JiraComment = {
  id: string;
  author: string;
  /** Who to mention in a reply; null for an app or an anonymized user. */
  accountId: string | null;
  created: string;
  updated: string;
  edited: boolean;
  /** Who may see it when not everyone: "Visible to Developers", "Internal"; null for a public comment. */
  restriction: string | null;
  markdown: string;
  url: string;
};

/** A page of comments as `GET /issue/{key}/comment` answers, read: the comments and how many the issue has. */
export type JiraCommentPage = { comments: JiraComment[]; total: number };

/** A role or group restriction, or Jira Service Management's internal note; null when everyone sees it. */
function restrictionOf(comment: Record<string, unknown>): string | null {
  const visibility = isRecord(comment.visibility) ? comment.visibility : null;
  const value = visibility ? text(visibility, 'value') : '';
  if (value !== '') {
    return `Visible to ${value}`;
  }
  return comment.jsdPublic === false ? 'Internal' : null;
}

function commentOf(comment: Record<string, unknown>, site: string, key: string): JiraComment {
  const author = isRecord(comment.author) ? comment.author : {};
  const id = text(comment, 'id');
  const created = text(comment, 'created');
  const updated = text(comment, 'updated') || created;
  return {
    id,
    author: text(author, 'displayName') || 'Someone',
    accountId: text(author, 'accountId') || null,
    created,
    updated,
    edited: updated !== created,
    restriction: restrictionOf(comment),
    markdown: adfMarkdown(comment.body),
    url: jiraCommentUrl(site, key, id),
  };
}

/** One page of `GET /issue/{key}/comment`; anything unexpected reads as no comments. */
export function commentPageOf(body: unknown, site: string, key: string): JiraCommentPage {
  const record = isRecord(body) ? body : {};
  const list = Array.isArray(record.comments)
    ? record.comments.filter((item) => isRecord(item))
    : [];
  const comments = list
    .map((comment) => commentOf(comment, site, key))
    .filter((comment) => comment.id !== '');
  const total = typeof record.total === 'number' ? record.total : comments.length;
  return { comments, total };
}
