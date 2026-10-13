import { useEffect, useRef } from 'react';

import type { EventRow } from '../../src/api-types';
import { subscribe } from './event-hub';

/** Calls `onEvent` with every new event, from the browser's one shared stream (`event-hub.ts`). */
export function useEvents(onEvent: (event: EventRow) => void): void {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);
  useEffect(
    () =>
      subscribe((event) => {
        handler.current(event);
      }),
    [],
  );
}
