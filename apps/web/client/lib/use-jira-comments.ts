// The comments of a ticket's Jira issue, read from Jira once per opening of its tab.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { JiraTabView } from '../../src/jira-comment-types';
import { request } from './api';

/** `refetch` is the tab's Refresh. */
export function useJiraComments(ticketId: number): UseQueryResult<JiraTabView> {
  return useQuery({
    queryKey: ['jira-comments', ticketId],
    queryFn: () => request<JiraTabView>('GET', `/api/tickets/${ticketId}/jira-comments`),
    staleTime: Infinity,
    retry: false,
  });
}
