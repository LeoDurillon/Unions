// A custom agent's changes from its page: rewriting its role, regenerating its prompt, deleting it.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { AgentConfig } from '@union/core';

import { customAgentsApi } from './custom-agents-api';
import { openUnionSettings } from './union-settings-sections';

export type CustomAgentActions = {
  edit: UseMutationResult<AgentConfig, Error, { name?: string; role?: string }>;
  regenerate: UseMutationResult<AgentConfig, Error, void>;
  remove: UseMutationResult<null, Error, void>;
};

export function useCustomAgent(id: number): CustomAgentActions {
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['agents'] });
  return {
    edit: useMutation({
      mutationFn: (change: { name?: string; role?: string }) => customAgentsApi.edit(id, change),
      onSuccess: refresh,
    }),
    regenerate: useMutation({
      mutationFn: () => customAgentsApi.regenerate(id),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: () => customAgentsApi.remove(id),
      onSuccess: async () => {
        openUnionSettings('models');
        await refresh();
      },
    }),
  };
}
