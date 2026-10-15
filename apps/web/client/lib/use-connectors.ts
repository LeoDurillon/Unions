import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { ConnectorsResponse } from '../../src/api-types';
import { request } from './api';

const CHECK_POLL_MS = 2000;

function checking(data: ConnectorsResponse | undefined): boolean {
  return data?.check?.status === 'queued' || data?.check?.status === 'running';
}

/**
 * The account's claude.ai connectors, and reading them again (polled while the worker checks). A
 * finished check refreshes the tool list, which offers the connectors to the agents.
 */
export function useConnectors(): {
  connectors: UseQueryResult<ConnectorsResponse>;
  check: ReturnType<typeof useMutation<ConnectorsResponse, Error, void>>;
  checking: boolean;
} {
  const queryClient = useQueryClient();
  const connectors = useQuery({
    queryKey: ['agent-connectors'],
    queryFn: (): Promise<ConnectorsResponse> => request('GET', '/api/agents/connectors'),
    refetchInterval: (query) => (checking(query.state.data) ? CHECK_POLL_MS : false),
  });
  const finishedAt = connectors.data?.check?.finishedAt ?? null;
  useEffect(() => {
    if (finishedAt !== null) {
      void queryClient.invalidateQueries({ queryKey: ['agent-tools'] });
    }
  }, [finishedAt, queryClient]);
  const check = useMutation({
    mutationFn: (): Promise<ConnectorsResponse> => request('POST', '/api/agents/connectors/check'),
    onSuccess: (data) => {
      queryClient.setQueryData(['agent-connectors'], data);
    },
  });
  return { connectors, check, checking: checking(connectors.data) || check.isPending };
}
