// The Notion page of a pull request under review: its text, the description's suggestions, checking, linking and unlinking.
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

/** The Notion pages the description links to and the integration can read, but the linked one. */
export function useReviewNotionSuggestions(
  review: CurrentReview,
  enabled: boolean,
): UseQueryResult<ReviewNotionLink[]> {
  return useQuery({
    queryKey: ['review-notion-suggestions', review.projectId, review.prNumber, review.notionPageId],
    queryFn: () => request<ReviewNotionLink[]>('GET', `${notionPath(review)}/suggestions`),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

/** `stack`: the stack's pull requests without a page get it too. */
export type LinkRequest = { page: string; stack?: boolean };

/** Linking and unlinking refresh the reviews list, which carries the link to the page. */
export function useReviewNotionLink(review: CurrentReview): {
  check: UseMutationResult<ReviewNotionLink, Error, string>;
  link: UseMutationResult<ReviewNotionLink, Error, LinkRequest>;
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
      mutationFn: (body: LinkRequest) => request<ReviewNotionLink>('PUT', notionPath(review), body),
      onSuccess: refresh,
    }),
    unlink: useMutation({
      mutationFn: () => request('DELETE', notionPath(review)),
      onSuccess: refresh,
    }),
  };
}
