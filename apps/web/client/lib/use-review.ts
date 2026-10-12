import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type {
  CommentView,
  DiffResponse,
  DiscussionResponse,
  ReviewImportResult,
} from '../../src/api-types';
import { api } from './api';

export function useDiff(ticketId: number): UseQueryResult<DiffResponse> {
  return useQuery({ queryKey: ['review', ticketId, 'diff'], queryFn: () => api.diff(ticketId) });
}

export function useDiffFile(
  ticketId: number,
  fileId: number | null,
): UseQueryResult<{ id: number; path: string; patch: string }> {
  return useQuery({
    queryKey: ['review', ticketId, 'file', fileId],
    queryFn: () => api.diffFile(ticketId, fileId ?? 0),
    enabled: fileId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * The linked pull request's discussion, read from GitHub. Its own key: live events refresh the
 * review data, and must not call GitHub each time; comment changes refresh it (`useCommentMutations`).
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

export function useComments(ticketId: number): UseQueryResult<CommentView[]> {
  return useQuery({
    queryKey: ['review', ticketId, 'comments'],
    queryFn: () => api.comments(ticketId),
  });
}

type CommentInput = Parameters<typeof api.addComment>[1];

/** Every write refreshes the comments; sending also refreshes the ticket. */
export function useCommentMutations(ticketId: number): {
  add: ReturnType<typeof useMutation<unknown, Error, CommentInput>>;
  edit: ReturnType<typeof useMutation<unknown, Error, { id: number; body: string }>>;
  remove: ReturnType<typeof useMutation<unknown, Error, number>>;
  send: ReturnType<typeof useMutation<{ sent: number }, Error, string>>;
  importFromGitHub: ReturnType<typeof useMutation<ReviewImportResult, Error, void>>;
  importNote: ReturnType<typeof useMutation<unknown, Error, string>>;
} {
  const queryClient = useQueryClient();
  // The discussion lists what is imported, so it follows the comments.
  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['review', ticketId] }),
      queryClient.invalidateQueries({ queryKey: ['pull-request', ticketId] }),
    ]);
  };
  return {
    add: useMutation({
      mutationFn: (input: CommentInput) => api.addComment(ticketId, input),
      onSuccess: refresh,
    }),
    edit: useMutation({
      mutationFn: ({ id, body }: { id: number; body: string }) =>
        api.editComment(ticketId, id, body),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api.deleteComment(ticketId, id),
      onSuccess: refresh,
    }),
    send: useMutation({
      mutationFn: (summary: string) => api.sendReview(ticketId, summary),
      onSuccess: async () => {
        await refresh();
        await queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      },
    }),
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
