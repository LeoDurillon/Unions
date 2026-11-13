// A ticket's tracker item linked after creation: checking an item, linking it, unlinking it.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { LinkedItem } from '@union/core';
import type { IntegrationKindName } from '@union/core/integration-kinds';

import { request } from '../app/api';
import { specsKey } from '../review/use-review-specs';
import { trackerCommentsKey } from './use-tracker-comments';
import { trackerItemKey } from './use-tracker-item';

const SPECS = specsKey('').at(-1);

export type TicketTrackerLinkActions = {
  check: UseMutationResult<LinkedItem, Error, string>;
  link: UseMutationResult<LinkedItem, Error, string>;
  unlink: UseMutationResult<unknown, Error, void>;
};

/** Linking and unlinking refresh the ticket, the board (its tracker filter), the specs and the tab's item. */
export function useTicketTrackerLink(
  ticketId: number,
  kind: IntegrationKindName,
): TicketTrackerLinkActions {
  const queryClient = useQueryClient();
  const path = `/api/tickets/${ticketId}/trackers/${kind}/link`;
  const refresh = async (): Promise<void> => {
    // Another item's comments and card, or none: the tab reads them again.
    queryClient.removeQueries({ queryKey: trackerCommentsKey(ticketId, kind) });
    queryClient.removeQueries({ queryKey: trackerItemKey(ticketId, kind) });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey.at(-1) === SPECS }),
    ]);
  };
  return {
    check: useMutation({
      mutationFn: (item: string) => request<LinkedItem>('POST', `${path}/check`, { item }),
    }),
    link: useMutation({
      mutationFn: (item: string) => request<LinkedItem>('PUT', path, { item }),
      onSuccess: refresh,
    }),
    unlink: useMutation({
      mutationFn: () => request('DELETE', path),
      onSuccess: refresh,
    }),
  };
}
