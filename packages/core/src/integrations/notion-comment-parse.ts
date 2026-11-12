// Notion's comment objects (`GET /v1/comments`) as `NotionComment`: who wrote what, where, when.

import { isRecord } from '../agent/agent-activity';

/** A run of a comment's text with its marks; a mention's text is its label (`@Name`). */
export type NotionRichText = {
  text: string;
  href: string | null;
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
};

/** One comment of a discussion. `blockId` is null for a comment on the page itself. */
export type NotionComment = {
  id: string;
  discussionId: string;
  blockId: string | null;
  /** The name Notion shows for it (`display_name`); empty when it gives none. */
  author: string;
  createdAt: string;
  richText: NotionRichText[];
};

function flag(annotations: unknown, name: string): boolean {
  return isRecord(annotations) && annotations[name] === true;
}

function richTextOf(texts: unknown): NotionRichText[] {
  if (!Array.isArray(texts)) {
    return [];
  }
  return texts.flatMap((text: unknown) => {
    if (!isRecord(text) || typeof text.plain_text !== 'string') {
      return [];
    }
    const { annotations } = text;
    return [
      {
        text: text.plain_text,
        href: typeof text.href === 'string' ? text.href : null,
        bold: flag(annotations, 'bold'),
        italic: flag(annotations, 'italic'),
        strikethrough: flag(annotations, 'strikethrough'),
        code: flag(annotations, 'code'),
      },
    ];
  });
}

function blockOf(parent: unknown): string | null {
  return isRecord(parent) && parent.type === 'block_id' && typeof parent.block_id === 'string'
    ? parent.block_id
    : null;
}

function authorOf(displayName: unknown): string {
  return isRecord(displayName) && typeof displayName.resolved_name === 'string'
    ? displayName.resolved_name
    : '';
}

/** A comment object, or null when it lacks an id, a discussion or a time. */
export function commentOf(value: unknown): NotionComment | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.discussion_id !== 'string' ||
    typeof value.created_time !== 'string'
  ) {
    return null;
  }
  return {
    id: value.id,
    discussionId: value.discussion_id,
    blockId: blockOf(value.parent),
    author: authorOf(value.display_name),
    createdAt: value.created_time,
    richText: richTextOf(value.rich_text),
  };
}

/** The comments of a list's `results`; anything unexpected is skipped. */
export function commentsOf(results: unknown): NotionComment[] {
  if (!Array.isArray(results)) {
    return [];
  }
  return results.flatMap((result: unknown) => {
    const comment = commentOf(result);
    return comment ? [comment] : [];
  });
}
