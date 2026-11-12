// The sidebar's "Reconnecting…" pill, shown while the live event stream is down for more than a
// moment. Its live region takes no space.

import type { ReactElement } from 'react';

import { useStreamStatus } from '../../lib/app/stream-status';
import { useNow } from '../../lib/ui/use-now';

/** A reconnect quicker than this (the API reloading) shows nothing. */
const SHOW_AFTER_MS = 3000;

/** Whether the stream has been reconnecting for `SHOW_AFTER_MS`. */
function useLongReconnect(): boolean {
  const { status, since } = useStreamStatus();
  const reconnecting = status === 'reconnecting';
  const now = useNow(reconnecting);
  return reconnecting && now - since >= SHOW_AFTER_MS;
}

/** "Reconnecting…" while the board cannot hear the worker's changes; nothing otherwise. */
export function StreamPill(): ReactElement {
  const shown = useLongReconnect();
  return (
    <output aria-live="polite" className="contents">
      {shown ? (
        <span
          title="Union lost its live connection to the server and is reconnecting. The board catches up on its own once it is back."
          className="flex items-center gap-2 rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900 group-data-[compact]/side:justify-center group-data-[compact]/side:px-0 dark:bg-amber-950/60 dark:text-amber-200"
        >
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-amber-500" />
          <span className="group-data-[compact]/side:sr-only">Reconnecting…</span>
        </span>
      ) : null}
    </output>
  );
}
