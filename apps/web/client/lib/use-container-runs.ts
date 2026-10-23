// The commands run in the target's workspace (polled while one is on), and running or stopping one.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { ContainerRunsView } from '../../src/api-types';
import type { ReviewRunsView } from '../../src/review-preview-types';
import { request } from './api';
import { runsKey, runsPath, type PreviewTarget } from './preview-target';

/** A command typed in the box, or a saved script by name. */
export type RunInput = { command: string } | { scriptName: string };

/** A ticket's runs (with whether one can go to the implementer), or a pull request's. */
export type RunsView = ContainerRunsView | ReviewRunsView;

const RUN_POLL_MS = 1000;

function running(data: RunsView | undefined): boolean {
  return (data?.runs ?? []).some((run) => run.status === 'queued' || run.status === 'running');
}

/** The commands run in the target's workspace (polled while one is on), and running or stopping one. */
export function useContainerRuns(target: PreviewTarget): {
  runs: UseQueryResult<RunsView>;
  run: ReturnType<typeof useMutation<RunsView, Error, RunInput>>;
  cancel: ReturnType<typeof useMutation<RunsView, Error, number>>;
  active: boolean;
} {
  const queryClient = useQueryClient();
  const key = runsKey(target);
  const path = runsPath(target);
  const runs = useQuery({
    queryKey: key,
    queryFn: (): Promise<RunsView> => request('GET', path),
    refetchInterval: (query) => (running(query.state.data) ? RUN_POLL_MS : false),
  });
  const update = (data: RunsView): void => {
    queryClient.setQueryData(key, data);
  };
  const run = useMutation({
    mutationFn: (input: RunInput): Promise<RunsView> => request('POST', path, input),
    onSuccess: update,
  });
  const cancel = useMutation({
    mutationFn: (runId: number): Promise<RunsView> => request('POST', `${path}/${runId}/cancel`),
    onSuccess: update,
  });
  return { runs, run, cancel, active: running(runs.data) };
}
