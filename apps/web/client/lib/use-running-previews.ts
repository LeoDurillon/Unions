// The previews running across projects (read again every few seconds: a pull request's send no events), and stopping one.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { RunningPreview } from '../../src/running-previews-types';
import { request } from './api';

export const RUNNING_PREVIEWS_KEY = ['previews', 'running'];
const POLL_MS = 5000;

export function useRunningPreviews(): UseQueryResult<RunningPreview[]> {
  return useQuery({
    queryKey: RUNNING_PREVIEWS_KEY,
    queryFn: (): Promise<RunningPreview[]> => request('GET', '/api/previews'),
    refetchInterval: POLL_MS,
  });
}

/** Asks the worker to stop one; the answer is the list as it stands. */
export function useStopPreview(): ReturnType<typeof useMutation<RunningPreview[], Error, number>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number): Promise<RunningPreview[]> =>
      request('POST', `/api/previews/${id}/stop`),
    onSuccess: (list) => {
      queryClient.setQueryData(RUNNING_PREVIEWS_KEY, list);
    },
  });
}
