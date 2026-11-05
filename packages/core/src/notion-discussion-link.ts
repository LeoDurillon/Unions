// The link that names a discussion of a Notion page, kept on a review comment imported from it; browser-safe.

/** Every discussion link starts so; GitHub's never do. */
export const NOTION_DISCUSSION_PREFIX = 'https://www.notion.so/';

/** `https://www.notion.so/<page>?d=<discussion>`, ids without dashes: one link per discussion. */
export function notionDiscussionUrl(pageId: string, discussionId: string): string {
  return `${NOTION_DISCUSSION_PREFIX}${pageId.replaceAll('-', '')}?d=${discussionId.replaceAll('-', '')}`;
}

/** A review comment's source is a Notion discussion, not a GitHub comment. */
export function isNotionUrl(url: string): boolean {
  return url.startsWith(NOTION_DISCUSSION_PREFIX);
}
