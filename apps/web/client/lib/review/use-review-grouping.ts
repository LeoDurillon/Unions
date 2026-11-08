// The newest grouping by spec of the review, with starting and cancelling one.

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { SpecSource } from '@union/core';

import type { GroupingView } from '../../../src/routes/review-groupings';
import { reviewGroupingApi } from './review-grouping-api';
import { reviewBase, type ReviewTarget } from './review-target';

/** Live events refresh it as the run moves; this slow poll only covers a live stream that is down. */
const SAFETY_POLL_MS = 30_000;

export function isGrouping(grouping: GroupingView | null | undefined): boolean {
  return grouping?.status === 'queued' || grouping?.status === 'running';
}

type Spec = { kind: SpecSource; label: string; spec: string };

/** The newest grouping by spec of the review, with starting and cancelling one. */
export function useReviewGrouping(target: ReviewTarget): {
  grouping: UseQueryResult<GroupingView | null>;
  start: ReturnType<typeof useMutation<GroupingView, Error, Spec>>;
  cancel: ReturnType<typeof useMutation<GroupingView, Error, void>>;
} {
  const queryClient = useQueryClient();
  const base = reviewBase(target);
  const queryKey = ['review', base, 'grouping'];
  const grouping = useQuery({
    queryKey,
    queryFn: () => reviewGroupingApi.latest(base),
    refetchInterval: (query) => (isGrouping(query.state.data) ? SAFETY_POLL_MS : false),
  });
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey });
  return {
    grouping,
    start: useMutation({
      mutationFn: (spec: Spec) => reviewGroupingApi.start(base, spec),
      onSuccess: refresh,
    }),
    cancel: useMutation({ mutationFn: () => reviewGroupingApi.cancel(base), onSuccess: refresh }),
  };
}
