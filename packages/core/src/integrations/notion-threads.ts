// A Notion page's open discussions as tracker threads, and a comment posted to one or to the page.
// The page's comments and those of each commented block are read one call at a time, as Notion's rate allows.

import type { NotionApi } from './notion-api';
import type { NotionComment } from './notion-comment-parse';
import {
  commentedSpans,
  discussionsOf,
  richTextMarkdown,
  type NotionDiscussion,
} from './notion-comments';
import { notionCommentUrl, notionDiscussionUrl } from './notion-discussion-link';
import { NotionError } from './notion-error';
import { toRichText } from './notion-rich-text';
import {
  commentCount,
  type TrackerCommentInput,
  type TrackerThread,
  type TrackerThreads,
} from './tracker-comments';
import { TrackerRefusedError } from './tracker-refused';

/** Notion allows about 3 requests a second: a page with more commented blocks is read in part. */
const MAX_COMMENT_BLOCKS = 30;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const NO_READ =
  'The Notion integration cannot read comments: in Notion, open the integration’s settings, then ' +
  'Capabilities, and turn on “Read comments”.';
const UNKNOWN_AUTHOR = 'Notion user';

/** Comments need their own capability: say which, rather than Notion's bare refusal. */
async function commentsOf(notion: NotionApi, token: string, id: string): Promise<NotionComment[]> {
  try {
    return await notion.comments(token, id);
  } catch (error) {
    if (error instanceof NotionError && error.status === FORBIDDEN) {
      throw new TrackerRefusedError(NO_READ);
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

function threadOf(pageId: string, discussion: NotionDiscussion): TrackerThread {
  const onBlock = discussion.quote === null ? 'block' : 'text';
  return {
    id: discussion.id,
    place: discussion.blockId === null ? 'item' : onBlock,
    quote: discussion.quote,
    url: notionDiscussionUrl(pageId, discussion.id),
    comments: discussion.comments.map((comment) => ({
      id: comment.id,
      author: comment.author || UNKNOWN_AUTHOR,
      createdAt: comment.createdAt,
      edited: false,
      restriction: null,
      markdown: richTextMarkdown(comment.richText),
      url: notionCommentUrl(pageId, discussion.id, comment.id),
      mention: null,
    })),
  };
}

/** The open discussions of the page, from its `markdown` as Notion gives it (not cleaned), already read. */
export async function notionThreadsOfPage(
  notion: NotionApi,
  token: string,
  page: { id: string; markdown: string },
): Promise<TrackerThreads> {
  const spans = commentedSpans(page.markdown);
  const blockIds = [...new Set(spans.map((span) => span.blockId))];
  const read = blockIds.slice(0, MAX_COMMENT_BLOCKS);
  const comments = await readComments(notion, token, page.id, read);
  const threads = discussionsOf(comments, spans).map((one) => threadOf(page.id, one));
  return { threads, total: commentCount(threads), truncated: read.length < blockIds.length };
}

/** The open discussions of the page, from its current text. */
export async function notionThreads(
  notion: NotionApi,
  token: string,
  pageId: string,
): Promise<TrackerThreads> {
  const { markdown } = await notion.pageMarkdown(token, pageId);
  return notionThreadsOfPage(notion, token, { id: pageId, markdown });
}

/** A reply in the discussion `threadId`, else a new comment on the page. */
export async function postNotionThreadComment(
  notion: NotionApi,
  token: string,
  post: TrackerCommentInput,
): Promise<{ commentId: string }> {
  const target = post.threadId === null ? { pageId: post.itemId } : { discussionId: post.threadId };
  const comment = await notion.addComment(token, target, toRichText(post.text));
  return { commentId: comment.id };
}

/** Notion's reason, with the capability named when it refused one. */
export function notionPostFailure(error: unknown, inThread: boolean): string {
  if (error instanceof NotionError && error.status === FORBIDDEN) {
    return 'Notion refused it: in the integration’s settings, Capabilities, turn on “Insert comments”';
  }
  if (error instanceof NotionError && error.status === NOT_FOUND && inThread) {
    return 'Notion did not find the discussion: it may have been resolved or deleted';
  }
  return error instanceof Error ? error.message : String(error);
}
