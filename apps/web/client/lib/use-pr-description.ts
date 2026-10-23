// A pull request's description rewrite (the ticket's or a slice's): its latest draft, and rewriting, sending, discarding or cancelling it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PrDescriptionView } from '../../src/api-types';
import { prDescriptionApi } from './pr-description-api';

export type DescriptionActions = {
  handleRewrite: () => void;
  handleSend: (text: string) => void;
  handleDiscard: () => void;
  handleCancel: () => void;
  busy: boolean;
  error: Error | null;
};

/** Under `['ticket', id]`: the live events about the ticket refresh it. */
export function usePrDescription(
  ticketId: number,
  pr: number,
): { view: PrDescriptionView | undefined; error: Error | null; actions: DescriptionActions } {
  const queryClient = useQueryClient();
  const queryKey = ['ticket', ticketId, 'pr-description', pr];
  const query = useQuery({ queryKey, queryFn: () => prDescriptionApi.get(ticketId, pr) });
  const draftId = query.data?.draft?.id ?? 0;
  const mutation = useMutation({
    mutationFn: (run: () => Promise<PrDescriptionView>) => run(),
    onSuccess: async (view) => {
      queryClient.setQueryData(queryKey, view);
      // A rewrite queues every slice's: the other pull requests' views change too.
      await queryClient.invalidateQueries({ queryKey: ['ticket', ticketId, 'pr-description'] });
    },
  });
  const run = (call: () => Promise<PrDescriptionView>): void => {
    mutation.mutate(call);
  };
  return {
    view: query.data,
    error: query.error,
    actions: {
      handleRewrite: () => {
        run(() => prDescriptionApi.rewrite(ticketId, pr));
      },
      handleSend: (text) => {
        run(() => prDescriptionApi.send(ticketId, draftId, text));
      },
      handleDiscard: () => {
        run(() => prDescriptionApi.discard(ticketId, draftId));
      },
      handleCancel: () => {
        run(() => prDescriptionApi.cancel(ticketId, draftId));
      },
      busy: mutation.isPending,
      error: mutation.error,
    },
  };
}
