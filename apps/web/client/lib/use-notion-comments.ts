// The open discussions of a ticket's Notion page, read from Notion once per opening of its tab.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { NotionDiscussionsView } from '../../src/notion-discussion-types';
import { request } from './api';

function query(ticketId: number): {
  queryKey: unknown[];
  queryFn: () => Promise<NotionDiscussionsView>;
} {
  return {
    queryKey: ['notion-comments', ticketId],
    queryFn: () =>
      request<NotionDiscussionsView>('GET', `/api/tickets/${ticketId}/notion-comments`),
  };
}

/** `refetch` is the tab's Refresh. */
export function useNotionComments(ticketId: number): UseQueryResult<NotionDiscussionsView> {
  return useQuery({ ...query(ticketId), staleTime: Infinity, retry: false });
}

/** How many discussions the tab found, once it has been read; null before (never read from here). */
export function useNotionDiscussionCount(ticketId: number): number | null {
  const { data } = useQuery({ ...query(ticketId), enabled: false, staleTime: Infinity });
  return data ? data.discussions.length : null;
}
