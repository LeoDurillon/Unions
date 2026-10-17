// What a ticket's or an investigation's agent calls used; refetched with the ticket or the investigations.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Investigation, UsageView } from '@union/core';

import { request } from './api';

/** Under `['ticket', id]`: the ticket's events refetch it. */
export function useTicketUsage(ticketId: number): UseQueryResult<UsageView> {
  return useQuery({
    queryKey: ['ticket', ticketId, 'usage'],
    queryFn: (): Promise<UsageView> => request('GET', `/api/tickets/${ticketId}/usage`),
  });
}

/** Under `['investigations']`: their events refetch it. */
export function useInvestigationUsage(
  investigation: Pick<Investigation, 'id' | 'projectId'>,
): UseQueryResult<UsageView> {
  const { id, projectId } = investigation;
  return useQuery({
    queryKey: ['investigations', id, 'usage'],
    queryFn: (): Promise<UsageView> =>
      request('GET', `/api/projects/${projectId}/investigations/${id}/usage`),
  });
}
