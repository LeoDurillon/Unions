// What a ticket's command output can do with the implementer: wait for its next run, or go now as a revision.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ContainerRunsView } from '../../src/api-types';
import { request } from './api';
import { runsKey } from './preview-target';

export function useRunAgent(ticketId: number): {
  keep: ReturnType<typeof useMutation<ContainerRunsView, Error, { runId: number; keep: boolean }>>;
  send: ReturnType<typeof useMutation<ContainerRunsView, Error, { runId: number; note: string }>>;
} {
  const queryClient = useQueryClient();
  const key = runsKey({ kind: 'ticket', ticketId });
  const path = `/api/tickets/${ticketId}/container-runs`;
  const update = (data: ContainerRunsView): void => {
    queryClient.setQueryData(key, data);
  };
  const keep = useMutation({
    mutationFn: (input: { runId: number; keep: boolean }): Promise<ContainerRunsView> =>
      request('POST', `${path}/${input.runId}/keep`, { keep: input.keep }),
    onSuccess: update,
  });
  // The revision moves the ticket: its panel reads it again.
  const send = useMutation({
    mutationFn: (input: { runId: number; note: string }): Promise<ContainerRunsView> =>
      request('POST', `${path}/${input.runId}/send`, { note: input.note }),
    onSuccess: update,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
  });
  return { keep, send };
}
