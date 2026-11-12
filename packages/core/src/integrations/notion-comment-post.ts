// A comment on a ticket's Notion page, as the web queues it (`post_notion_comment`) and the worker posts it; browser-safe.

import { isRecord } from '../agent/agent-activity';
import { MAX_TEXT_OBJECTS, toRichText } from './notion-rich-text';

/** A comment longer than this is better written in Notion. */
const MAX_NOTION_COMMENT = 4000;

/** The payload of a `post_notion_comment` command: a reply in `discussionId`, else a new page comment. */
export type NotionCommentPost = {
  projectId: number;
  ticketId: number;
  pageId: string;
  discussionId: string | null;
  text: string;
};

/** Why Notion would refuse the text, or null when it can be sent. */
export function notionCommentProblem(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 'Write a comment first';
  }
  if (trimmed.length > MAX_NOTION_COMMENT) {
    return `A comment is at most ${MAX_NOTION_COMMENT.toLocaleString('en')} characters`;
  }
  return toRichText(trimmed).length > MAX_TEXT_OBJECTS
    ? `A comment has at most ${MAX_TEXT_OBJECTS} links and marks`
    : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** The comment a `post_notion_comment` command carries; throws when the payload is not one. */
export function notionCommentOf(payload: unknown): NotionCommentPost {
  const record = isRecord(payload) ? payload : {};
  const { projectId, ticketId, text } = record;
  const pageId = nonEmpty(record.pageId);
  if (!Number.isInteger(projectId) || !Number.isInteger(ticketId) || pageId === null) {
    throw new TypeError('post_notion_comment needs a "projectId", a "ticketId" and a "pageId"');
  }
  if (typeof text !== 'string' || notionCommentProblem(text) !== null) {
    throw new TypeError('post_notion_comment needs a "text" Notion accepts');
  }
  return {
    projectId: Number(projectId),
    ticketId: Number(ticketId),
    pageId,
    discussionId: nonEmpty(record.discussionId),
    text: text.trim(),
  };
}
