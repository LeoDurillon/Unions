import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { CurrentReview, PullRequestListItem } from '../../src/api-types';
import { api } from './api';

/** How often the list is read again while a review is being posted on GitHub. */
const POSTING_POLL_MS = 2000;

export function useCurrentReviews(projectId: number): UseQueryResult<CurrentReview[]> {
  return useQuery({
    queryKey: ['current-reviews', projectId],
    queryFn: () => api.currentReviews(projectId),
    refetchInterval: (query) =>
      query.state.data?.some((review) => review.submitStatus === 'sending')
        ? POSTING_POLL_MS
        : false,
  });
}

/** Adding and removing refresh the list (and the Pull requests tab, which marks what is in it). */
export function useCurrentReviewMutations(projectId: number): {
  add: ReturnType<typeof useMutation<CurrentReview, Error, PullRequestListItem>>;
  addStack: ReturnType<typeof useMutation<CurrentReview[], Error, PullRequestListItem[]>>;
  remove: ReturnType<typeof useMutation<unknown, Error, number>>;
} {
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['current-reviews', projectId] });
  return {
    add: useMutation({
      mutationFn: (pull: PullRequestListItem) => api.addCurrentReview(projectId, pull),
      onSuccess: refresh,
    }),
    addStack: useMutation({
      mutationFn: (pulls: PullRequestListItem[]) => api.addCurrentReviewStack(projectId, pulls),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (number: number) => api.removeCurrentReview(projectId, number),
      onSuccess: refresh,
    }),
  };
}
