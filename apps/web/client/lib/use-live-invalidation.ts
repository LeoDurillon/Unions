// Refetches board, ticket, investigation and notification data whenever the worker records a
// change.
import { useQueryClient } from '@tanstack/react-query';

import { ticketReviewBase } from './review-target';
import { useEvents } from './use-event-stream';
import { NOTIFICATIONS_KEY } from './use-notifications';

/** Refetches board, ticket, investigation and notification data whenever the worker records a change. */
export function useLiveInvalidation(): void {
  const queryClient = useQueryClient();
  useEvents((event) => {
    if (event.type === 'notification_created') {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      return;
    }
    if (event.type === 'custom_agent_prompt_ready' || event.type === 'custom_agent_prompt_failed') {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
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
