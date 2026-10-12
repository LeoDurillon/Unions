import { useQueryClient } from '@tanstack/react-query';

import { ticketReviewBase } from './review-target';
import { useEventStream } from './use-event-stream';

/** Refetches board, ticket and investigation data whenever the worker records a change. */
export function useLiveInvalidation(): void {
  const queryClient = useQueryClient();
  useEventStream('/api/events?after=latest', (event) => {
    if (event.type === 'agent_event') {
      return;
    }
    if (event.investigationId !== null) {
      void queryClient.invalidateQueries({ queryKey: ['investigations'] });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    if (event.ticketId !== null) {
      void queryClient.invalidateQueries({ queryKey: ['ticket', event.ticketId] });
      void queryClient.invalidateQueries({
        queryKey: ['review', ticketReviewBase(event.ticketId)],
      });
    }
  });
}
