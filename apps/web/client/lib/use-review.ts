import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type {
  CommentView,
  DiffResponse,
  DiscussionResponse,
  ReviewImportResult,
} from '../../src/api-types';
import { agentReviewApi } from './agent-review-api';
import { api } from './api';
import { reviewBase, ticketReviewBase, type ReviewTarget } from './review-target';

/** While a pull request review is being posted, its comments are polled to see them turn sent. */
const POSTING_POLL_MS = 2000;

export function useDiff(target: ReviewTarget): UseQueryResult<DiffResponse> {
  const base = reviewBase(target);
  return useQuery({
    queryKey: ['review', base, 'diff'],
    queryFn: () => api.diff(base),
    // A pull request's diff is read from GitHub: not again on every focus.
    refetchOnWindowFocus: target.kind === 'ticket',
    retry: false,
  });
}

export function useDiffFile(
  target: ReviewTarget,
  fileId: number | null,
): UseQueryResult<{ id: number; path: string; patch: string }> {
  const base = reviewBase(target);
  return useQuery({
    queryKey: ['review', base, 'file', fileId],
    queryFn: () => api.diffFile(base, fileId ?? 0),
    enabled: fileId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * The linked pull request's discussion, read from GitHub. Its own key: live events refresh the
 * review data, and must not call GitHub each time; comment changes refresh it.
 */
export function useDiscussion(
  ticketId: number,
  enabled: boolean,
): UseQueryResult<DiscussionResponse> {
  return useQuery({
    queryKey: ['pull-request', ticketId, 'discussion'],
    queryFn: () => api.discussion(ticketId),
    enabled,
    retry: false,
  });
}

/** A pull request under review: its description and discussion, read from GitHub once per opening. */
export function useReviewDiscussion(target: ReviewTarget): UseQueryResult<DiscussionResponse> {
  const base = reviewBase(target);
  return useQuery({
    queryKey: ['review', base, 'discussion'],
    queryFn: () => api.reviewDiscussion(base),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useComments(target: ReviewTarget, posting = false): UseQueryResult<CommentView[]> {
  const base = reviewBase(target);
  return useQuery({
    // `posting` in the key: when posting ends, the comments are read once more, now sent.
    queryKey: ['review', base, 'comments', posting],
    queryFn: () => api.comments(base),
    refetchInterval: posting ? POSTING_POLL_MS : false,
  });
}

/** Each review's draft count, from the same cache as `useComments`; null while it loads. */
export function useDraftCounts(
  reviews: { target: ReviewTarget; posting: boolean }[],
): (number | null)[] {
  return useQueries({
    queries: reviews.map(({ target, posting }) => {
      const base = reviewBase(target);
      return {
        queryKey: ['review', base, 'comments', posting],
        queryFn: () => api.comments(base),
      };
    }),
  }).map((query) => query.data?.filter((comment) => comment.status === 'draft').length ?? null);
}

/** What else a review write changes: the ticket's PR discussion, or the current reviews list. */
function related(target: ReviewTarget): unknown[][] {
  return target.kind === 'ticket'
    ? [['pull-request', target.ticketId]]
    : [['current-reviews', target.projectId]];
}

type CommentInput = Parameters<typeof api.addComment>[1];

/** Every write refreshes the comments; sending also refreshes the ticket or the review's status. */
export function useCommentMutations(target: ReviewTarget): {
  add: ReturnType<typeof useMutation<unknown, Error, CommentInput>>;
  edit: ReturnType<typeof useMutation<unknown, Error, { id: number; body: string }>>;
  remove: ReturnType<typeof useMutation<unknown, Error, number>>;
  keep: ReturnType<typeof useMutation<unknown, Error, number>>;
  send: ReturnType<typeof useMutation<unknown, Error, string>>;
} {
  const queryClient = useQueryClient();
  const base = reviewBase(target);
  // Only the comments: refreshing the whole review would read a pull request's diff from GitHub again.
  const refresh = async (): Promise<void> => {
    await Promise.all(
      [['review', base, 'comments'], ...related(target)].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
  return {
    add: useMutation({
      mutationFn: (input: CommentInput) => api.addComment(base, input),
      onSuccess: refresh,
    }),
    edit: useMutation({
      mutationFn: ({ id, body }: { id: number; body: string }) => api.editComment(base, id, body),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api.deleteComment(base, id),
      onSuccess: refresh,
    }),
    keep: useMutation({
      mutationFn: (id: number) => agentReviewApi.keepComment(base, id),
      onSuccess: refresh,
    }),
    send: useMutation({
      mutationFn: (summary: string) => api.sendReview(base, summary),
      onSuccess: async () => {
        await refresh();
        if (target.kind === 'ticket') {
          await queryClient.invalidateQueries({ queryKey: ['ticket', target.ticketId] });
        }
      },
    }),
  };
}

/** Importing a ticket's linked pull request comments as drafts (PR tab and review header). */
export function useImportMutations(ticketId: number): {
  importFromGitHub: ReturnType<typeof useMutation<ReviewImportResult, Error, void>>;
  importNote: ReturnType<typeof useMutation<unknown, Error, string>>;
} {
  const queryClient = useQueryClient();
  // The discussion lists what is imported, so it follows the comments.
  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['review', ticketReviewBase(ticketId)] }),
      queryClient.invalidateQueries({ queryKey: ['pull-request', ticketId] }),
    ]);
  };
  return {
    importFromGitHub: useMutation({
      mutationFn: () => api.importReviewComments(ticketId),
      onSuccess: refresh,
    }),
    importNote: useMutation({
      mutationFn: (url: string) => api.importReviewNote(ticketId, url),
      onSuccess: refresh,
    }),
  };
}
