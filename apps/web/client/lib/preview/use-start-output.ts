// The lines a ticket's preview prints while it starts (its build, its services), as they arrive.

import { isEvent } from '@union/core/event-catalog';
import { useCallback, useState } from 'react';

import type { EventRow } from '../../../src/api-types';
import { useEvents } from '../app/use-event-stream';

/** Lines kept: the end of a build is what says how it is going. */
const MAX_LINES = 200;

type Collected = { startedAt: number | null; lines: string[] };

/**
 * The output of the start in progress, from the shared event stream: what arrived since the panel
 * opened, or since `startedAt` for a start made after. A pull request's preview sends no events.
 */
export function useStartOutput(ticketId: number | null, startedAt: number | null): string[] {
  const [collected, setCollected] = useState<Collected>({ startedAt, lines: [] });
  const onEvent = useCallback(
    (event: EventRow) => {
      if (ticketId === null || event.ticketId !== ticketId || !isEvent(event, 'preview_output')) {
        return;
      }
      const added = event.payload.lines;
      setCollected((previous) => ({
        startedAt,
        lines: [...(previous.startedAt === startedAt ? previous.lines : []), ...added].slice(
          -MAX_LINES,
        ),
      }));
    },
    [ticketId, startedAt],
  );
  useEvents(onEvent);
  return collected.startedAt === startedAt ? collected.lines : [];
}
