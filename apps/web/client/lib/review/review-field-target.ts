// Where a property set from a review's tab goes: the review's route, its item's events, the tab's list of items.

import type { CurrentReview } from '../../../src/api-types';
import { hasPendingFields, type TrackerFieldTarget } from '../integrations/use-tracker-fields';
import { reviewBase } from './review-target';

/** The review's base path, for its tracker routes. */
export function reviewTrackerBase(review: CurrentReview): string {
  return reviewBase({ kind: 'pull-request', projectId: review.projectId, number: review.prNumber });
}

/** A Notion page's or a Jira issue's id in the tab's list (`pageId`, `key`). */
function idOf(item: unknown): string | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  if ('pageId' in item && typeof item.pageId === 'string') {
    return item.pageId;
  }
  return 'key' in item && typeof item.key === 'string' ? item.key : null;
}

function isOwn(payload: unknown, reviewId: number, itemId: string): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'reviewId' in payload &&
    payload.reviewId === reviewId &&
    'itemId' in payload &&
    payload.itemId === itemId
  );
}

/** One linked item of the review (`itemId` of `kind`), in the tab's list cached under `queryKey`. */
export function reviewFieldTarget(
  review: CurrentReview,
  item: { kind: 'notion' | 'jira'; itemId: string },
  queryKey: unknown[],
): TrackerFieldTarget {
  return {
    url: `${reviewTrackerBase(review)}/tracker-fields`,
    body: item,
    owns: (event) => isOwn(event.payload, review.id, item.itemId),
    queryKey,
    addPending: (old, pending) =>
      Array.isArray(old)
        ? old.map((one: unknown) =>
            idOf(one) === item.itemId && hasPendingFields(one)
              ? { ...one, pendingFields: [...one.pendingFields, pending] }
              : one,
          )
        : old,
  };
}
