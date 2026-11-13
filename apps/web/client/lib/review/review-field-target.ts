// Where a property set from a review's tab goes: the review's route, its item's events, the tab's list of items.

import type { IntegrationKindName } from '@union/core/integration-kinds';

import type { CurrentReview } from '../../../src/api-types';
import { hasPendingFields, type TrackerFieldTarget } from '../integrations/use-tracker-fields';
import { reviewBase } from './review-target';

/** The review's base path, for its tracker routes. */
export function reviewTrackerBase(review: CurrentReview): string {
  return reviewBase({ kind: 'pull-request', projectId: review.projectId, number: review.prNumber });
}

/** An item's id in the tab's list. */
function idOf(item: unknown): string | null {
  return typeof item === 'object' &&
    item !== null &&
    'itemId' in item &&
    typeof item.itemId === 'string'
    ? item.itemId
    : null;
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
  item: { kind: IntegrationKindName; itemId: string },
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
