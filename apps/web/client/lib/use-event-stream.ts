import { useEffect, useRef } from 'react';

import type { EventRow } from '../../src/api-types';

function isEventRow(value: unknown): value is EventRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'seq' in value &&
    typeof value.seq === 'number' &&
    'type' in value &&
    typeof value.type === 'string'
  );
}

/**
 * Subscribes to the SSE stream at `url`. EventSource reconnects by itself and
 * sends `Last-Event-ID`, so no event is missed or repeated.
 */
export function useEventStream(url: string, onEvent: (event: EventRow) => void): void {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const source = new EventSource(url);
    const listener = (message: MessageEvent<string>): void => {
      const row: unknown = JSON.parse(message.data);
      if (isEventRow(row)) {
        handler.current(row);
      }
    };
    // Named SSE events do not reach `onmessage`; every event type we emit is listed here.
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, listener);
    }
    return () => {
      source.close();
    };
  }, [url]);
}

const EVENT_TYPES = [
  'ticket_created',
  'phase_changed',
  'run_started',
  'run_finished',
  'step_output',
  'agent_event',
  'command_failed',
  'github_issue_created',
  'github_sync_error',
  'github_status_reverted',
  'ticket_updated_from_github',
] as const;
