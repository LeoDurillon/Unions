import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { AgentReviewView } from '../../src/api-types';
import { agentReviewApi } from './agent-review-api';
import { reviewBase, type ReviewTarget } from './review-target';

/** While the agent works, its status is polled (a pull request review has no live events). */
const ACTIVE_POLL_MS = 3000;

export function isActive(review: AgentReviewView | null | undefined): boolean {
  return review?.status === 'queued' || review?.status === 'running';
}

/**
 * The latest agent review of the target, with starting and cancelling it. When a run ends, the
 * comments are read again: its suggestions are new drafts.
 */
export function useAgentReview(target: ReviewTarget): {
  review: UseQueryResult<AgentReviewView | null>;
  start: ReturnType<typeof useMutation<AgentReviewView, Error, void>>;
  cancel: ReturnType<typeof useMutation<AgentReviewView, Error, void>>;
} {
  const queryClient = useQueryClient();
  const base = reviewBase(target);
  const queryKey = ['review', base, 'agent-review'];
  const review = useQuery({
    queryKey,
    queryFn: () => agentReviewApi.latest(base),
    refetchInterval: (query) => (isActive(query.state.data) ? ACTIVE_POLL_MS : false),
  });
  const active = isActive(review.data);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) {
      void queryClient.invalidateQueries({ queryKey: ['review', base, 'comments'] });
    }
    wasActive.current = active;
  }, [active, base, queryClient]);
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey });
  return {
    review,
    start: useMutation({ mutationFn: () => agentReviewApi.start(base), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: () => agentReviewApi.cancel(base), onSuccess: refresh }),
  };
}
