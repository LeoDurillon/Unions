import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { ContainerRunsView } from '../../src/api-types';
import { request } from './api';

const RUN_POLL_MS = 1000;

function running(data: ContainerRunsView | undefined): boolean {
  return (data?.runs ?? []).some((run) => run.status === 'queued' || run.status === 'running');
}

/** The commands run in the ticket's workspace (polled while one is on), and running or stopping one. */
export function useContainerRuns(ticketId: number): {
  runs: UseQueryResult<ContainerRunsView>;
  run: ReturnType<typeof useMutation<ContainerRunsView, Error, string>>;
  cancel: ReturnType<typeof useMutation<ContainerRunsView, Error, number>>;
  keep: ReturnType<typeof useMutation<ContainerRunsView, Error, { runId: number; keep: boolean }>>;
  send: ReturnType<typeof useMutation<ContainerRunsView, Error, { runId: number; note: string }>>;
  active: boolean;
} {
  const queryClient = useQueryClient();
  const key = ['ticket', ticketId, 'container-runs'];
  const path = `/api/tickets/${ticketId}/container-runs`;
  const runs = useQuery({
    queryKey: key,
    queryFn: (): Promise<ContainerRunsView> => request('GET', path),
    refetchInterval: (query) => (running(query.state.data) ? RUN_POLL_MS : false),
  });
  const update = (data: ContainerRunsView): void => {
    queryClient.setQueryData(key, data);
  };
  const run = useMutation({
    mutationFn: (command: string): Promise<ContainerRunsView> => request('POST', path, { command }),
    onSuccess: update,
  });
  const cancel = useMutation({
    mutationFn: (runId: number): Promise<ContainerRunsView> =>
      request('POST', `${path}/${runId}/cancel`),
    onSuccess: update,
  });
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
  return { runs, run, cancel, keep, send, active: running(runs.data) };
}
