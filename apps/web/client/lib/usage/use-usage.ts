// What agent calls used: a ticket's or an investigation's (refetched with them) and a project's
// over a range of days. Also how much of the Claude subscription's windows is used.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  ClaudeLimits,
  Investigation,
  ProjectFindings,
  ProjectUsage,
  UsageView,
} from '@union/core';

import { request } from '../app/api';

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

/** Union learns the windows only from its own agents' calls: asking more often than this adds nothing. */
const LIMITS_POLL_MS = 60_000;

/** How much of the subscription's five-hour and weekly windows is used; null before any report. */
export function useClaudeLimits(): UseQueryResult<ClaudeLimits | null> {
  return useQuery({
    queryKey: ['claude-limits'],
    queryFn: (): Promise<ClaudeLimits | null> => request('GET', '/api/claude-limits'),
    refetchInterval: LIMITS_POLL_MS,
  });
}

export type UsageRange = '7' | '30' | '90' | 'all';

/** Under `['tickets', projectId]`: a ticket's events refetch it. */
export function useProjectUsage(
  projectId: number,
  range: UsageRange,
): UseQueryResult<ProjectUsage> {
  return useQuery({
    queryKey: ['tickets', projectId, 'usage', range],
    queryFn: (): Promise<ProjectUsage> =>
      request('GET', `/api/projects/${projectId}/usage?days=${range}`),
  });
}

/** Under `['tickets', projectId]`, like the usage it reads. */
export function useProjectFindings(
  projectId: number,
  range: UsageRange,
): UseQueryResult<ProjectFindings> {
  return useQuery({
    queryKey: ['tickets', projectId, 'usage-findings', range],
    queryFn: (): Promise<ProjectFindings> =>
      request('GET', `/api/projects/${projectId}/usage/findings?days=${range}`),
  });
}
