// The long-lived Claude token the agents run with: whether one is set, saving and removing it.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ClaudeTokenStatus } from '@union/core';

import { request } from '../app/api';

const KEY = ['claude-token'];

/**
 * The token's status (never the token), and saving or removing it. Either reads the connectors
 * again on the server, so their list is refreshed too.
 */
export function useClaudeToken(): {
  status: UseQueryResult<ClaudeTokenStatus>;
  save: UseMutationResult<ClaudeTokenStatus, Error, string>;
  remove: UseMutationResult<ClaudeTokenStatus, Error, void>;
} {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: KEY,
    queryFn: (): Promise<ClaudeTokenStatus> => request('GET', '/api/claude-token'),
  });
  const onSuccess = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: KEY });
    await queryClient.invalidateQueries({ queryKey: ['agent-connectors'] });
  };
  const save = useMutation({
    mutationFn: (token: string): Promise<ClaudeTokenStatus> =>
      request('PUT', '/api/claude-token', { token }),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (): Promise<ClaudeTokenStatus> => request('DELETE', '/api/claude-token'),
    onSuccess,
  });
  return { status, save, remove };
}
