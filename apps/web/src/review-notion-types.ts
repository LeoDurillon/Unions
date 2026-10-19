// What a pull request under review's Notion tab reads: its linked page, with the text as read now.

/** The linked page, its text cleaned as a ticket's imported description is. */
export type ReviewNotionPage = {
  title: string;
  url: string;
  markdown: string;
  /** Notion cut a long page short. */
  truncated: boolean;
};

/** A page as the link field previews it before saving, or as just linked. */
export type ReviewNotionLink = { pageId: string; title: string; url: string };
