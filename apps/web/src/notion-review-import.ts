// Adds a discussion of a ticket's Notion page to its review, as a general draft for the implementer, and says which already are.
import { isNotionUrl, notionDiscussionUrl, schema, type Db, type Ticket } from '@union/core';
import { and, eq, isNotNull } from 'drizzle-orm';

import type { NotionDiscussionView } from './notion-discussion-types';

const WHERE: Record<NotionDiscussionView['place'], string> = {
  page: 'on the Notion page',
  text: 'on the Notion page',
  block: 'on a block of the Notion page',
};

/** The whole thread: who opened it and about what, then each reply. */
function discussionBody(discussion: NotionDiscussionView): string {
  const about = discussion.quote === null ? '' : `, about "${discussion.quote}"`;
  return discussion.comments
    .map(
      (comment, index) =>
        `**${comment.author}** ${index === 0 ? `${WHERE[discussion.place]}${about}` : 'replied'}:\n\n${comment.markdown}`,
    )
    .join('\n\n');
}

/** The ids of the page's discussions already in the ticket's review (sent or not). */
export function importedDiscussions(
  db: Db,
  ticketId: number,
  pageId: string,
  discussionIds: readonly string[],
): string[] {
  const urls = new Set(
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
  return discussionIds.filter((id) => urls.has(notionDiscussionUrl(pageId, id)));
}

/** Adds the discussion as a general draft of the ticket's review; false when it is in it already. */
export function importNotionDiscussion(
  db: Db,
  ticket: Ticket,
  pageId: string,
  discussion: NotionDiscussionView,
): boolean {
  if (importedDiscussions(db, ticket.id, pageId, [discussion.id]).length > 0) {
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
      body: discussionBody(discussion),
      // A general comment is never outdated: no head to keep.
      headSha: '',
      sourceUrl: notionDiscussionUrl(pageId, discussion.id),
    })
    .run();
  return true;
}
