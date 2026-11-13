// A ticket's tracker item for its tab's card (a Notion page, a Jira issue), read once per opening of the tab.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { IntegrationKindName } from '@union/core/integration-kinds';

import type { TrackerItemView } from '../../../src/tracker-item-types';
import { request } from '../app/api';

/** The card's view in the query cache: setting a property updates it. */
export function trackerItemKey(ticketId: number, kind: IntegrationKindName): unknown[] {
  return ['tracker-item', ticketId, kind];
}

/** `refetch` is part of the tab's Refresh. */
export function useTrackerItem(
  ticketId: number,
  kind: IntegrationKindName,
): UseQueryResult<TrackerItemView> {
  return useQuery({
    queryKey: trackerItemKey(ticketId, kind),
    queryFn: () =>
      request<TrackerItemView>('GET', `/api/tickets/${ticketId}/trackers/${kind}/item`),
    staleTime: Infinity,
    retry: false,
  });
}
