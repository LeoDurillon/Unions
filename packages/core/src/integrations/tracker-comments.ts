// A tracker item's comments as Union shows them, the same for every tracker: threads, each oldest first; browser-safe.
// A Notion discussion is a thread; a Jira comment is a thread of one, since Jira has none.

import type { MentionTarget } from './adf-mention';

/** One comment: who wrote it and when, who may see it, its text as markdown, and where it is. */
export type TrackerComment = {
  id: string;
  author: string;
  createdAt: string;
  edited: boolean;
  /** Who may see it when not everyone ("Visible to Developers", "Internal"); null when everyone can. */
  restriction: string | null;
  markdown: string;
  /** The comment in the tracker; also the source of a review comment added from it alone. */
  url: string;
  /** Who a reply to it mentions, where a reply is a new comment (`commentReplies: 'mention'`); null otherwise. */
  mention: MentionTarget | null;
};

/** Where a thread is: on the item itself, on a span of its text (`quote`), or on a whole block. */
type ThreadPlace = 'item' | 'text' | 'block';

/** A thread of comments, oldest first; `url` is the thread in the tracker, and a whole thread's review source. */
export type TrackerThread = {
  id: string;
  place: ThreadPlace;
  quote: string | null;
  url: string;
  comments: TrackerComment[];
};

/**
 * An item's threads: `total` is how many comments it has (more than shown when the oldest are left
 * out); `truncated` says some places of the item were not read.
 */
export type TrackerThreads = { threads: TrackerThread[]; total: number; truncated: boolean };

/** What a comment sent to an item is: in `threadId` (a reply), else a new comment; `mention` first. */
export type TrackerCommentInput = {
  itemId: string;
  threadId: string | null;
  mention: MentionTarget | null;
  text: string;
};

/** The comments in a thread's list, counted. */
export function commentCount(threads: readonly TrackerThread[]): number {
  return threads.reduce((sum, thread) => sum + thread.comments.length, 0);
}
