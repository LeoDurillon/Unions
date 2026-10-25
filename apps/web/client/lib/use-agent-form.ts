// An agent's page form in the Union settings: its prompt, model, effort and tools, saved together, and its reset.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { AgentConfig, AgentEffort, AgentModel } from '@union/core';

import { api } from './api';
import { useSettingsForm, type SettingsForm } from './use-settings-form';

export type AgentEdits = {
  prompt: string;
  model: AgentModel | null;
  effort: AgentEffort | null;
  tools: string[] | null;
};

export function sameTools(a: string[] | null, b: string[] | null): boolean {
  return a?.join('\n') === b?.join('\n');
}

/** Why the edits cannot be saved as they are, or null. */
export function invalidReason(edits: AgentEdits): string | null {
  if (edits.prompt.trim() === '') {
    return 'The prompt is empty.';
  }
  return edits.tools?.length === 0 ? 'Select at least one tool.' : null;
}

export function useAgentForm(config: AgentConfig): SettingsForm<AgentEdits> {
  const queryClient = useQueryClient();
  return useSettingsForm<AgentEdits>(
    () => ({
      prompt: config.prompt,
      model: config.model,
      effort: config.effort,
      tools: config.tools,
    }),
    async (edits) => {
      await api.saveAgent(config.agent, {
        ...edits,
        // Unchanged default tools stay unsaved, so a later change of the defaults applies.
        tools: sameTools(edits.tools, config.defaultTools) ? null : edits.tools,
      });
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  );
}

/** Reset to default: deletes the agent's edits, then `onReset`. */
export function useResetAgent(
  agent: AgentConfig['agent'],
  onReset: () => void,
): UseMutationResult<unknown, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.resetAgent(agent),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      onReset();
    },
  });
}
