// A ticket's implementer session in its panel: its size, its latest compaction, and compacting or cancelling one.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SessionCompactionView } from '../../../src/routes/tickets/ticket-session';
import { request } from '../app/api';

function base(ticketId: number): string {
  return `/api/tickets/${ticketId}/compaction`;
}

export type SessionCompactionState = {
  view: SessionCompactionView | undefined;
  handleCompact: () => void;
  handleCancel: (compactionId: number) => void;
  busy: boolean;
  error: Error | null;
};

/** Under `['ticket', id]`: the live events about the ticket refresh it. */
export function useSessionCompaction(ticketId: number): SessionCompactionState {
  const queryClient = useQueryClient();
  const queryKey = ['ticket', ticketId, 'compaction'];
  const query = useQuery({
    queryKey,
    queryFn: () => request<SessionCompactionView>('GET', base(ticketId)),
  });
  const mutation = useMutation({
    mutationFn: (path: string) => request<SessionCompactionView>('POST', path),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKey, view);
    },
  });
  return {
    view: query.data,
    handleCompact: () => {
      mutation.mutate(base(ticketId));
    },
    handleCancel: (compactionId) => {
      mutation.mutate(`${base(ticketId)}/${compactionId}/cancel`);
    },
    busy: mutation.isPending,
    error: mutation.error,
  };
}
