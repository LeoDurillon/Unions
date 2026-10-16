// Polls a ticket's or an investigation's Log while it is shown: all of it first, then what is new.
import type { LogEntry } from '@union/core';
import { useEffect, useState } from 'react';

import { api } from './api';

/** Agent output is not on the shared stream: an open Log asks for its new lines this often. */
const POLL_MS = 1000;

type Log = { entries: LogEntry[]; error: Error | null };

/** What was read, for the query it was read for: another query's reads are not shown. */
type State = Log & { query: string };

const EMPTY: Log = { entries: [], error: null };

/**
 * The Log's entries, in order, kept up to date while mounted. A hidden tab skips its polls; a failed
 * poll shows its error and is tried again, from the same cursor.
 */
export function useLog(query: string): Log {
  const [state, setState] = useState<State>({ query, ...EMPTY });
  useEffect(() => {
    let cursor: string | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async (): Promise<void> => {
      try {
        if (cursor === null || !document.hidden) {
          const page = await api.eventLog(query, cursor);
          if (stopped) {
            return;
          }
          ({ cursor } = page);
          setState((previous) => ({
            query,
            entries:
              previous.query === query ? [...previous.entries, ...page.entries] : page.entries,
            error: null,
          }));
        }
      } catch (error) {
        if (!stopped) {
          const failure = error instanceof Error ? error : new Error(String(error));
          setState((previous) => ({
            ...(previous.query === query ? previous : EMPTY),
            query,
            error: failure,
          }));
        }
      }
      if (!stopped) {
        timer = setTimeout(() => void poll(), POLL_MS);
      }
    };
    void poll();
    return () => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [query]);
  return state.query === query ? state : EMPTY;
}
