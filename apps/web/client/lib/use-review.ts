import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { CommentView, DiffResponse } from '../../src/api-types';
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
} {
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['review', ticketId] });
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
  };
}
