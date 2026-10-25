// A ticket's Notion page linked after creation: checking a page, linking it, unlinking it.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { ReviewNotionLink } from '../../src/review-notion-types';
import { request } from './api';
import { specsKey } from './use-review-specs';

const SPECS = specsKey('').at(-1);

export type TicketNotionActions = {
  check: UseMutationResult<ReviewNotionLink, Error, string>;
  link: UseMutationResult<ReviewNotionLink, Error, string>;
  unlink: UseMutationResult<unknown, Error, void>;
};

/** Linking and unlinking refresh the ticket, the board (its Notion filter) and the specs (the page is one). */
export function useTicketNotion(ticketId: number): TicketNotionActions {
  const queryClient = useQueryClient();
  const path = `/api/tickets/${ticketId}/notion`;
  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey.at(-1) === SPECS }),
    ]);
  };
  return {
    check: useMutation({
      mutationFn: (page: string) => request<ReviewNotionLink>('POST', `${path}/check`, { page }),
    }),
    link: useMutation({
      mutationFn: (page: string) => request<ReviewNotionLink>('PUT', path, { page }),
      onSuccess: refresh,
    }),
    unlink: useMutation({
      mutationFn: () => request('DELETE', path),
      onSuccess: refresh,
    }),
  };
}
