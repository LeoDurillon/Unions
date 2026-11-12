// The project's shared services as the worker last saw them, and asking it to restart or stop them.
// They are read again every few seconds: they send no events.

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { SharedServicesView } from '../../../src/shared-services-types';
import { request } from '../app/api';

const POLL_MS = 5000;

function keyOf(projectId: number): (string | number)[] {
  return ['shared-services', projectId];
}

export function useSharedServices(projectId: number): UseQueryResult<SharedServicesView> {
  return useQuery({
    queryKey: keyOf(projectId),
    queryFn: (): Promise<SharedServicesView> =>
      request('GET', `/api/projects/${projectId}/shared-services`),
    refetchInterval: POLL_MS,
  });
}

/** Asks the worker to restart or stop them; the answer is their state with the request pending. */
export function useSharedServicesAction(
  projectId: number,
): ReturnType<typeof useMutation<SharedServicesView, Error, 'restart' | 'stop'>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: 'restart' | 'stop'): Promise<SharedServicesView> =>
      request('POST', `/api/projects/${projectId}/shared-services/${action}`),
    onSuccess: (view) => {
      queryClient.setQueryData(keyOf(projectId), view);
    },
  });
}
