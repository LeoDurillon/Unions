// Reads a Notion page's open discussions for the panel: the page's comments and those of each
// commented block, grouped. Each discussion comes with the text it is about.
import {
  commentedSpans,
  discussionsOf,
  NotionError,
  richTextMarkdown,
  type NotionApi,
  type NotionComment,
  type NotionDiscussion,
} from '@union/core';

import { CONFLICT, fail } from './http';
import type { NotionDiscussionsView, NotionDiscussionView } from './notion-discussion-types';
import { guarded } from './routes/notion';

/** Notion allows about 3 requests a second: a page with more commented blocks is read in part. */
const MAX_COMMENT_BLOCKS = 30;
const FORBIDDEN = 403;
const NO_CAPABILITY =
  'The Notion integration cannot read comments: in Notion, open the integration’s settings, then ' +
  'Capabilities, and turn on “Read comments”.';
const UNKNOWN_AUTHOR = 'Notion user';

/** Comments need their own capability: say which, rather than Notion's bare refusal. */
async function commentsOf(notion: NotionApi, token: string, id: string): Promise<NotionComment[]> {
  try {
    return await notion.comments(token, id);
  } catch (error) {
    if (error instanceof NotionError && error.status === FORBIDDEN) {
      throw fail(CONFLICT, NO_CAPABILITY);
    }
    throw error;
  }
}

/** The page's comments, then each block's in turn, so as not to pass Notion's rate. */
async function readComments(
  notion: NotionApi,
  token: string,
  pageId: string,
  blockIds: string[],
): Promise<NotionComment[]> {
  const comments = await commentsOf(notion, token, pageId);
  for (const blockId of blockIds) {
    // One block at a time: Notion answers 429 to bursts.
    // oxlint-disable-next-line no-await-in-loop
    comments.push(...(await commentsOf(notion, token, blockId)));
  }
  return comments;
}

function discussionUrl(pageUrl: string, discussionId: string): string {
  const url = new URL(pageUrl);
  url.searchParams.set('d', discussionId.replaceAll('-', ''));
  return url.toString();
}

function viewOf(discussion: NotionDiscussion, pageUrl: string): NotionDiscussionView {
  const onBlock = discussion.quote === null ? 'block' : 'text';
  return {
    id: discussion.id,
    place: discussion.blockId === null ? 'page' : onBlock,
    quote: discussion.quote,
    url: discussionUrl(pageUrl, discussion.id),
    comments: discussion.comments.map((comment) => ({
      id: comment.id,
      author: comment.author || UNKNOWN_AUTHOR,
      createdAt: comment.createdAt,
      markdown: richTextMarkdown(comment.richText),
    })),
  };
}

/** The open discussions of the page, from its `markdown` as Notion gives it now (not cleaned). */
export function discussionsOfPage(
  notion: NotionApi,
  token: string,
  page: { id: string; url: string; markdown: string },
): Promise<NotionDiscussionsView> {
  return guarded(async () => {
    const spans = commentedSpans(page.markdown);
    const blockIds = [...new Set(spans.map((span) => span.blockId))];
    const read = blockIds.slice(0, MAX_COMMENT_BLOCKS);
    const comments = await readComments(notion, token, page.id, read);
    return {
      pageUrl: page.url,
      discussions: discussionsOf(comments, spans).map((discussion) => viewOf(discussion, page.url)),
      truncated: read.length < blockIds.length,
    };
  });
}

/** The open discussions of the page, from its current text (not an import's copy). */
export async function readDiscussions(
  notion: NotionApi,
  token: string,
  page: { id: string; url: string },
): Promise<NotionDiscussionsView> {
  const { markdown } = await guarded(() => notion.pageMarkdown(token, page.id));
  return discussionsOfPage(notion, token, { ...page, markdown });
}
