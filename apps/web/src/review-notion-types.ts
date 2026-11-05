// What a pull request under review's Notion tab reads: its linked pages, with their text and open discussions as read now.
import type { NotionDiscussionsView } from './notion-discussion-types';

/** A linked page, its text cleaned as a ticket's imported description is. */
export type ReviewNotionPage = {
  pageId: string;
  title: string;
  url: string;
  markdown: string;
  /** Notion cut a long page short. */
  truncated: boolean;
  /** The page's open discussions, or why they could not be read (the text still shows). */
  discussions: NotionDiscussionsView | { error: string };
};

/** A page as the link field previews it before saving, or as just linked. */
export type ReviewNotionLink = { pageId: string; title: string; url: string };
