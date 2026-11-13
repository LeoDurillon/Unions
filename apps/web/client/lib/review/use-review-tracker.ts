// The items of one tracker a pull request under review is linked to: their text and comments, the suggestions.
// Also checking an item, linking one more (to the stack's reviews without one too) and unlinking one.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { LinkedItem } from '@union/core';
import type { IntegrationKindName } from '@union/core/integration-kinds';

import type { CurrentReview } from '../../../src/api-types';
import type { ReviewTrackerItem } from '../../../src/review-tracker-types';
import { request } from '../app/api';
import { reviewTrackerBase } from './review-field-target';
import { specsKey } from './use-review-specs';

const SPECS = specsKey('').at(-1);

function trackerPath(review: CurrentReview, kind: IntegrationKindName): string {
  return `${reviewTrackerBase(review)}/trackers/${kind}`;
}

/** The linked items, as a key: read again when one is linked or unlinked. */
function itemsKey(review: CurrentReview, kind: IntegrationKindName): string {
  return review.linkedItems[kind].map((item) => item.id).join(',');
}

/** The tab's view in the query cache: a change to one of its items updates it. */
export function reviewTrackerKey(review: CurrentReview, kind: IntegrationKindName): unknown[] {
  return ['review-tracker', kind, review.projectId, review.prNumber, itemsKey(review, kind)];
}

/** Read from the tracker once per opening of the tab; `refetch` is its Refresh. */
export function useReviewTrackerItems(
  review: CurrentReview,
  kind: IntegrationKindName,
): UseQueryResult<ReviewTrackerItem[]> {
  return useQuery({
    queryKey: reviewTrackerKey(review, kind),
    queryFn: () => request<ReviewTrackerItem[]>('GET', trackerPath(review, kind)),
    staleTime: Infinity,
    retry: false,
  });
}

/** The items the pull request names (title, branch, description), readable and not linked. */
export function useReviewTrackerSuggestions(
  review: CurrentReview,
  kind: IntegrationKindName,
): UseQueryResult<LinkedItem[]> {
  return useQuery({
    queryKey: ['review-tracker-suggestions', ...reviewTrackerKey(review, kind)],
    queryFn: () => request<LinkedItem[]>('GET', `${trackerPath(review, kind)}/suggestions`),
    staleTime: Infinity,
    retry: false,
  });
}

/** `stack`: the stack's pull requests without an item of the tracker get it too. */
type LinkRequest = { item: string; stack?: boolean };

export type ReviewTrackerActions = {
  check: UseMutationResult<LinkedItem, Error, string>;
  link: UseMutationResult<LinkedItem, Error, LinkRequest>;
  unlink: UseMutationResult<unknown, Error, string>;
};

/** Linking and unlinking refresh the reviews list (it carries the items) and the review's specs. */
export function useReviewTrackerLink(
  review: CurrentReview,
  kind: IntegrationKindName,
): ReviewTrackerActions {
  const queryClient = useQueryClient();
  const path = trackerPath(review, kind);
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['current-reviews', review.projectId] });
    // Linking the whole stack changes the other members' specs too: every review's are read again.
    await queryClient.invalidateQueries({ predicate: (query) => query.queryKey.at(-1) === SPECS });
  };
  return {
    check: useMutation({
      mutationFn: (item: string) => request<LinkedItem>('POST', `${path}/check`, { item }),
    }),
    link: useMutation({
      mutationFn: (body: LinkRequest) => request<LinkedItem>('PUT', path, body),
      onSuccess: refresh,
    }),
    unlink: useMutation({
      mutationFn: (itemId: string) => request('DELETE', `${path}/${encodeURIComponent(itemId)}`),
      onSuccess: refresh,
    }),
  };
}
