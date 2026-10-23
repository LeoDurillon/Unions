// The CI of a split ticket's open slices, read from GitHub when the PR tab opens and every 30 s while a check runs.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { StackChecksView } from '../../src/ci-api-types';
import { request } from './api';

const PENDING_POLL_MS = 30_000;

/** `enabled`: the ticket is split and its pull request open. */
export function useStackChecks(
  ticketId: number,
  enabled: boolean,
): UseQueryResult<StackChecksView> {
  return useQuery({
    queryKey: ['ticket', ticketId, 'pr-checks', 'stack'],
    queryFn: (): Promise<StackChecksView> =>
      request('GET', `/api/tickets/${ticketId}/pr-checks/stack`),
    enabled,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.slices.some((slice) => (slice.counts?.pending ?? 0) > 0) === true
        ? PENDING_POLL_MS
        : false,
  });
}
