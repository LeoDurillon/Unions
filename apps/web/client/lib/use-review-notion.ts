// The Notion pages of a pull request under review: their text, the description's suggestions,
// checking, linking one more and unlinking one.
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
import { reviewBase } from './review-target';
import { specsKey } from './use-review-specs';

const SPECS = specsKey('').at(-1);

function basePath(review: CurrentReview): string {
  return reviewBase({ kind: 'pull-request', projectId: review.projectId, number: review.prNumber });
}

function notionPath(review: CurrentReview): string {
  return `${basePath(review)}/notion`;
}

/** The linked pages, as a key: read again when one is linked or unlinked. */
function pagesKey(review: CurrentReview): string {
  return review.notionPages.map((page) => page.id).join(',');
}

/** Read from Notion once per opening of the tab; `refetch` is its Refresh. */
export function useReviewNotionPages(review: CurrentReview): UseQueryResult<ReviewNotionPage[]> {
  return useQuery({
    queryKey: ['review-notion', review.projectId, review.prNumber, pagesKey(review)],
    queryFn: () => request<ReviewNotionPage[]>('GET', notionPath(review)),
    staleTime: Infinity,
    retry: false,
  });
}

/** The Notion pages the description links to and the integration can read, but the linked ones. */
export function useReviewNotionSuggestions(
  review: CurrentReview,
  enabled: boolean,
): UseQueryResult<ReviewNotionLink[]> {
  return useQuery({
    queryKey: ['review-notion-suggestions', review.projectId, review.prNumber, pagesKey(review)],
    queryFn: () => request<ReviewNotionLink[]>('GET', `${notionPath(review)}/suggestions`),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

/** `stack`: the stack's pull requests without a page get it too. */
export type LinkRequest = { page: string; stack?: boolean };

/** Linking and unlinking refresh the reviews list (it carries the pages) and the review's specs. */
export function useReviewNotionLink(review: CurrentReview): {
  check: UseMutationResult<ReviewNotionLink, Error, string>;
  link: UseMutationResult<ReviewNotionLink, Error, LinkRequest>;
  unlink: UseMutationResult<unknown, Error, string>;
} {
  const queryClient = useQueryClient();
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['current-reviews', review.projectId] });
    // Linking the whole stack changes the other members' specs too: every review's are read again.
    await queryClient.invalidateQueries({ predicate: (query) => query.queryKey.at(-1) === SPECS });
  };
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
      mutationFn: (pageId: string) => request('DELETE', `${notionPath(review)}/${pageId}`),
      onSuccess: refresh,
    }),
  };
}
