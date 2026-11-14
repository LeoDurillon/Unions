// A setup card's Test again and Ask the agent to fix: the worker checks the card's values, or the agent gets the failure.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Investigation } from '@union/core';

import { api } from '../app/api';
import { setupApi, type SetupTestRequest } from './setup-api';

export type SetupCheckActions = {
  test: () => void;
  /** Sends the agent the failure, as a follow-up: it proposes everything again. */
  fix: (prompt: string) => void;
  pending: boolean;
  error: Error | null;
};

/** `values`: what Test again sends, read when clicked so it is what the fields hold then. */
export function useSetupCheck(
  investigation: Investigation,
  values: () => SetupTestRequest,
): SetupCheckActions {
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['investigations'] });
  const test = useMutation({
    mutationFn: () => setupApi.test(investigation.projectId, values()),
    onSuccess: refresh,
  });
  const fix = useMutation({
    mutationFn: (prompt: string) => api.askFollowUp(investigation, prompt),
    onSuccess: refresh,
  });
  return {
    test: () => {
      test.mutate();
    },
    fix: (prompt) => {
      fix.mutate(prompt);
    },
    pending: test.isPending || fix.isPending,
    error: test.error ?? fix.error,
  };
}
