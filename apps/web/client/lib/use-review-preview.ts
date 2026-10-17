// A pull request's preview as its Preview tab reads it (its checkout, its screenshots), and adding an output to the review.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { ReviewPreviewView } from '../../src/review-preview-types';
import { request } from './api';
import { previewKey, previewPath, previewPoll, type PreviewTarget } from './preview-target';
import { reviewBase } from './review-target';

export type PullRequestTarget = Extract<PreviewTarget, { kind: 'pull-request' }>;

/** The same query as the preview section's, read with the pull request's own fields. */
export function useReviewPreview(target: PullRequestTarget): UseQueryResult<ReviewPreviewView> {
  return useQuery({
    queryKey: previewKey(target),
    queryFn: (): Promise<ReviewPreviewView> => request('GET', previewPath(target)),
    refetchInterval: (current) => previewPoll(target, current.state.data),
  });
}

/** Posts to `path` (under the review), which writes a draft comment; the drafts are read again. */
export function useAddToReview(
  target: PullRequestTarget,
  path: string,
): ReturnType<typeof useMutation<unknown, Error, void>> {
  const queryClient = useQueryClient();
  const base = reviewBase(target);
  return useMutation({
    mutationFn: (): Promise<unknown> => request('POST', `${base}${path}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['review', base, 'comments'] }),
  });
}

/** Where the update to the reviewed commit is asked for; the answer is the new view. */
export function useCheckoutUpdate(
  target: PullRequestTarget,
): ReturnType<typeof useMutation<ReviewPreviewView, Error, void>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<ReviewPreviewView> => request('POST', `${previewPath(target)}/update`),
    onSuccess: (view) => {
      queryClient.setQueryData(previewKey(target), view);
    },
  });
}
