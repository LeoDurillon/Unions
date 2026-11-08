// Refetches board, ticket, investigation and notification data whenever the worker records a
// change.
import { useQueryClient } from '@tanstack/react-query';

import { invalidationKeys } from './live-invalidation-keys';
import { useEvents } from './use-event-stream';

/** Refetches board, ticket, investigation and notification data whenever the worker records a change. */
export function useLiveInvalidation(): void {
  const queryClient = useQueryClient();
  useEvents((event) => {
    for (const queryKey of invalidationKeys(event)) {
      void queryClient.invalidateQueries({ queryKey });
    }
  });
}
