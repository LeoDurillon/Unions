// The Notion page of a pull request under review: its text, and checking, linking and unlinking a page.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { CurrentReview } from '../../src/api-types';
import type { ReviewNotionLink, ReviewNotionPage } from '../../src/review-notion-types';
import { request } from './api';

function notionPath(review: CurrentReview): string {
  return `/api/projects/${review.projectId}/pull-requests/reviews/${review.prNumber}/notion`;
}

/** Read from Notion once per opening of the tab; `refetch` is its Refresh. */
export function useReviewNotionPage(review: CurrentReview): UseQueryResult<ReviewNotionPage> {
  return useQuery({
    queryKey: ['review-notion', review.projectId, review.prNumber, review.notionPageId],
    queryFn: () => request<ReviewNotionPage>('GET', notionPath(review)),
    staleTime: Infinity,
    retry: false,
  });
}

/** Linking and unlinking refresh the reviews list, which carries the link to the page. */
export function useReviewNotionLink(review: CurrentReview): {
  check: UseMutationResult<ReviewNotionLink, Error, string>;
  link: UseMutationResult<ReviewNotionLink, Error, string>;
  unlink: UseMutationResult<unknown, Error, void>;
} {
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['current-reviews', review.projectId] });
  return {
    check: useMutation({
      mutationFn: (page: string) =>
        request<ReviewNotionLink>('POST', `${notionPath(review)}/check`, { page }),
    }),
    link: useMutation({
      mutationFn: (page: string) => request<ReviewNotionLink>('PUT', notionPath(review), { page }),
      onSuccess: refresh,
    }),
    unlink: useMutation({
      mutationFn: () => request('DELETE', notionPath(review)),
      onSuccess: refresh,
    }),
  };
}
