// The review's explanations, polled while one waits or runs, with asking, following up and cancelling.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { ExplanationLogView, ExplanationView } from '../../src/routes/review-explanations';
import { explanationApi, type ExplanationAsk } from './explanation-api';
import { reviewBase, type ReviewTarget } from './review-target';

/** A pull request review has no live events: the panel polls while the agent works. */
const ACTIVE_POLL_MS = 3000;

export function isExplaining(explanation: ExplanationView): boolean {
  return explanation.status === 'queued' || explanation.status === 'running';
}

export function useExplanations(target: ReviewTarget): {
  explanations: UseQueryResult<ExplanationView[]>;
  ask: ReturnType<typeof useMutation<ExplanationView, Error, ExplanationAsk>>;
  cancel: ReturnType<typeof useMutation<ExplanationView, Error, number>>;
} {
  const queryClient = useQueryClient();
  const base = reviewBase(target);
  const queryKey = ['review', base, 'explanations'];
  const explanations = useQuery({
    queryKey,
    queryFn: () => explanationApi.list(base),
    refetchInterval: (query) =>
      query.state.data?.some((row) => isExplaining(row)) ? ACTIVE_POLL_MS : false,
  });
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey });
  return {
    explanations,
    ask: useMutation({
      mutationFn: (ask: ExplanationAsk) => explanationApi.start(base, ask),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: (id: number) => explanationApi.cancel(base, id),
      onSuccess: refresh,
    }),
  };
}

/** What the agent printed so far, polled while it runs. */
export function useExplanationLog(
  target: ReviewTarget,
  id: number,
  running: boolean,
): UseQueryResult<ExplanationLogView> {
  const base = reviewBase(target);
  return useQuery({
    queryKey: ['review', base, 'explanations', id, 'log'],
    queryFn: () => explanationApi.log(base, id),
    enabled: running,
    refetchInterval: running ? ACTIVE_POLL_MS : false,
  });
}
