// Pull requests under review that a read from GitHub shows closed or merged: removed with what they hold.

import { schema, type Db } from '@union/core';
import { and, eq, inArray } from 'drizzle-orm';

import type { PullRequestFilter } from '../../api-types';
import type { RemotePullRequest } from '../../github-pull-requests';
import { forgetReviews, removeReviewFiles } from './review-removal';

/**
 * The reviewed numbers the listing shows are no longer open: listed closed or merged, or missing
 * from an Open listing that holds every open pull request (not when only the newest are shown).
 */
export function closedReviewNumbers(
  reviewed: number[],
  listing: { total: number; pullRequests: Pick<RemotePullRequest, 'number' | 'state'>[] },
  filter: PullRequestFilter,
): number[] {
  const states = new Map(listing.pullRequests.map((pull) => [pull.number, pull.state]));
  const complete = filter === 'open' && listing.total <= listing.pullRequests.length;
  return reviewed.filter((number) => {
    const state = states.get(number);
    return state === undefined ? complete : state !== 'open';
  });
}

/** Removes the project's reviews of pull requests the listing shows closed or merged. */
export async function removeClosedReviews(
  db: Db,
  projectId: number,
  listing: { total: number; pullRequests: RemotePullRequest[] },
  filter: PullRequestFilter,
): Promise<void> {
  const reviews = db
    .select({ prNumber: schema.currentReviews.prNumber })
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.projectId, projectId))
    .all();
  const closed = closedReviewNumbers(
    reviews.map((review) => review.prNumber),
    listing,
    filter,
  );
  if (closed.length === 0) {
    return;
  }
  const removed = db.transaction((tx) => {
    const rows = tx
      .delete(schema.currentReviews)
      .where(
        and(
          eq(schema.currentReviews.projectId, projectId),
          inArray(schema.currentReviews.prNumber, closed),
        ),
      )
      .returning({ id: schema.currentReviews.id })
      .all();
    forgetReviews(
      tx,
      rows.map((row) => row.id),
    );
    return rows;
  });
  await removeReviewFiles(removed.map((row) => row.id));
}
