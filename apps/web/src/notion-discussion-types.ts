// What a ticket's Notion tab reads: the open discussions of its page, as read now.

import type { TrackerProperty } from '@union/core';

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

/**
 * What is already in the ticket's review (the ids of discussions added whole and of page comments
 * added alone), and why one cannot be added now (null when it can).
 */
type NotionReviewState = { importedIds: string[]; refusal: string | null };

/** The page itself as Notion has it now: its title, its status column's value, when it changed, its properties. */
export type NotionPageFacts = {
  title: string;
  status: { name: string; value: string } | null;
  editedAt: string | null;
  properties: TrackerProperty[];
};

/** What the ticket's tab reads: the page, the discussions, the comments being sent, and Add to review. */
export type NotionTabView = NotionDiscussionsView & {
  /** Null when the page could not be read; the discussions still show. */
  page: NotionPageFacts | null;
  pending: PendingNotionComment[];
  review: NotionReviewState;
};
