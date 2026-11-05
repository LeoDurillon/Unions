// What a ticket's Notion tab reads: the open discussions of its page, as read now.

/** One comment: who wrote it, when, and its text as markdown. */
export type NotionCommentView = { id: string; author: string; createdAt: string; markdown: string };

/** A thread of comments, oldest first. */
export type NotionDiscussionView = {
  id: string;
  /** Where it is: on the page itself, on a span of its text (`quote`), or on a whole block. */
  place: 'page' | 'text' | 'block';
  quote: string | null;
  /** The discussion in Notion. */
  url: string;
  comments: NotionCommentView[];
};

export type NotionDiscussionsView = {
  pageUrl: string;
  discussions: NotionDiscussionView[];
  /** The page has more commented blocks than one read takes: the last ones were not read. */
  truncated: boolean;
};

/** A comment queued for the worker that Notion does not have yet; `discussionId` null for a page comment. */
export type PendingNotionComment = {
  commandId: number;
  discussionId: string | null;
  text: string;
  createdAt: number;
};

/** What the ticket's tab reads: the discussions, and the comments being sent. */
export type NotionTabView = NotionDiscussionsView & { pending: PendingNotionComment[] };
