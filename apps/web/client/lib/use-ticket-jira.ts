// A ticket's Jira issue linked after creation: checking an issue, linking it, unlinking it.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { JiraIssueLink } from '../../src/routes/ticket-jira-link';
import { request } from './api';

export type TicketJiraActions = {
  check: UseMutationResult<JiraIssueLink, Error, string>;
  link: UseMutationResult<JiraIssueLink, Error, string>;
  unlink: UseMutationResult<unknown, Error, void>;
};

/** Linking and unlinking refresh the ticket, the board (its Jira filter) and the ticket's Jira comments. */
export function useTicketJira(ticketId: number): TicketJiraActions {
  const queryClient = useQueryClient();
  const path = `/api/tickets/${ticketId}/jira`;
  const refresh = async (): Promise<void> => {
    // Another issue's comments, or none: the tab reads them again.
    queryClient.removeQueries({ queryKey: ['jira-comments', ticketId] });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
    ]);
  };
  return {
    check: useMutation({
      mutationFn: (issue: string) => request<JiraIssueLink>('POST', `${path}/check`, { issue }),
    }),
    link: useMutation({
      mutationFn: (issue: string) => request<JiraIssueLink>('PUT', path, { issue }),
      onSuccess: refresh,
    }),
    unlink: useMutation({
      mutationFn: () => request('DELETE', path),
      onSuccess: refresh,
    }),
  };
}
