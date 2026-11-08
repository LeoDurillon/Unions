// The review agents a review page can run, each one's newest run on the change, and running or cancelling one.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { ReviewAgentRunView, ReviewAgentsView } from '../../src/routes/review-agent-runs';
import { reviewAgentsApi } from './review-agents-api';
import { reviewBase, type ReviewTarget } from './review-target';

/** Live events refresh it as the run moves; this slow poll only covers a live stream that is down. */
const SAFETY_POLL_MS = 30_000;

export function isActive(run: Pick<ReviewAgentRunView, 'status'>): boolean {
  return run.status === 'queued' || run.status === 'running';
}

export function useReviewAgents(target: ReviewTarget): {
  agents: UseQueryResult<ReviewAgentsView>;
  run: ReturnType<typeof useMutation<ReviewAgentsView, Error, number>>;
  cancel: ReturnType<typeof useMutation<ReviewAgentsView, Error, number>>;
} {
  const queryClient = useQueryClient();
  const base = reviewBase(target);
  const queryKey = ['review', base, 'review-agents'];
  const agents = useQuery({
    queryKey,
    queryFn: () => reviewAgentsApi.list(base),
    refetchInterval: (query) =>
      query.state.data?.runs.some(isActive) === true ? SAFETY_POLL_MS : false,
  });
  const show = (view: ReviewAgentsView): void => {
    queryClient.setQueryData(queryKey, view);
  };
  return {
    agents,
    run: useMutation({
      mutationFn: (agentId: number) => reviewAgentsApi.run(base, agentId),
      onSuccess: show,
    }),
    cancel: useMutation({
      mutationFn: (runId: number) => reviewAgentsApi.cancel(base, runId),
      onSuccess: show,
    }),
  };
}
