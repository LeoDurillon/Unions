// What a ticket's tracker tab reads about its item's comments: the threads read now, those being sent, the review's.
import type { IntegrationKindName, TrackerThreads } from '@union/core';

/** A comment queued for the worker that the tracker does not have yet; `threadId` null for a new comment. */
export type PendingTrackerComment = {
  commandId: number;
  threadId: string | null;
  text: string;
  createdAt: number;
};

export type TrackerCommentsView = TrackerThreads & {
  kind: IntegrationKindName;
  pending: PendingTrackerComment[];
  /** The ids of the threads and comments in the ticket's review, and why more cannot be added now (null: they can). */
  review: { importedIds: string[]; refusal: string | null };
};
