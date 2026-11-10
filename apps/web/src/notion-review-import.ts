// Adds a discussion of a ticket's Notion page, or one comment of it, to its review, as a general draft for the implementer, and says which already are.
import {
  isNotionUrl,
  notionCommentUrl,
  notionDiscussionUrl,
  schema,
  type Db,
  type Ticket,
} from '@union/core';
import { and, eq, isNotNull } from 'drizzle-orm';

import type { NotionCommentView, NotionDiscussionView } from './notion-discussion-types';

const WHERE: Record<NotionDiscussionView['place'], string> = {
  page: 'on the Notion page',
  text: 'on the Notion page',
  block: 'on a block of the Notion page',
};

function opening(discussion: NotionDiscussionView, comment: NotionCommentView): string {
  const about = discussion.quote === null ? '' : `, about "${discussion.quote}"`;
  return `**${comment.author}** ${WHERE[discussion.place]}${about}:\n\n${comment.markdown}`;
}

/** The whole thread: who opened it and about what, then each reply. */
function discussionBody(discussion: NotionDiscussionView): string {
  return discussion.comments
    .map((comment, index) =>
      index === 0
        ? opening(discussion, comment)
        : `**${comment.author}** replied:\n\n${comment.markdown}`,
    )
    .join('\n\n');
}

/** The Notion links of the ticket's review comments (sent or not). */
function importedUrls(db: Db, ticketId: number): Set<string> {
  return new Set(
    db
      .select({ url: schema.reviewComments.sourceUrl })
      .from(schema.reviewComments)
      .where(
        and(
          eq(schema.reviewComments.ticketId, ticketId),
          isNotNull(schema.reviewComments.sourceUrl),
        ),
      )
      .all()
      .flatMap((row) => (row.url !== null && isNotionUrl(row.url) ? [row.url] : [])),
  );
}

/**
 * The ids of what is already in the ticket's review: the discussions added whole, and the comments
 * added one by one.
 */
export function importedDiscussions(
  db: Db,
  ticketId: number,
  pageId: string,
  discussions: readonly NotionDiscussionView[],
): string[] {
  const urls = importedUrls(db, ticketId);
  return discussions.flatMap((discussion) => [
    ...(urls.has(notionDiscussionUrl(pageId, discussion.id)) ? [discussion.id] : []),
    ...discussion.comments
      .filter((comment) => urls.has(notionCommentUrl(pageId, discussion.id, comment.id)))
      .map((comment) => comment.id),
  ]);
}

/** A discussion of the page, and the one comment of it to add alone (null: the whole thread). */
export type NotionImport = { discussion: NotionDiscussionView; commentId: string | null };

/** Adds the discussion (or its one comment) as a general draft; false when it is in the review already. */
export function importNotionDiscussion(
  db: Db,
  ticket: Ticket,
  pageId: string,
  { discussion, commentId }: NotionImport,
): boolean {
  const comment = discussion.comments.find((one) => one.id === commentId);
  const sourceUrl = comment
    ? notionCommentUrl(pageId, discussion.id, comment.id)
    : notionDiscussionUrl(pageId, discussion.id);
  if (importedUrls(db, ticket.id).has(sourceUrl)) {
    return false;
  }
  db.insert(schema.reviewComments)
    .values({
      ticketId: ticket.id,
      kind: 'general',
      path: '',
      side: 'new',
      startLine: 0,
      endLine: 0,
      excerpt: '',
      body: comment ? opening(discussion, comment) : discussionBody(discussion),
      // A general comment is never outdated: no head to keep.
      headSha: '',
      sourceUrl,
    })
    .run();
  return true;
}
