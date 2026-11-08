// Whether the live event stream is connected, for the sidebar's "Reconnecting…" pill, and how long to wait before reopening it.
import { useSyncExternalStore } from 'react';

export type StreamStatus = 'live' | 'reconnecting';

const SECOND = 1000;
/** The longest wait between reopens: a server down for long is still found again within it. */
const LONGEST_SECONDS = 30;

/** The status, and since when (ms) it has been so. Replaced on each change, as `useSyncExternalStore` wants. */
export type StreamState = { status: StreamStatus; since: number };

let state: StreamState = { status: 'live', since: 0 };
const watchers = new Set<() => void>();

/** How long to wait before the `attempt`-th reopen (0-based): 1 s, doubled each time, at most 30 s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(2 ** Math.max(0, attempt), LONGEST_SECONDS) * SECOND;
}

export function setStreamStatus(next: StreamStatus): void {
  if (next === state.status) {
    return;
  }
  state = { status: next, since: Date.now() };
  for (const watcher of watchers) {
    watcher();
  }
}

function watch(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

function current(): StreamState {
  return state;
}

/** The stream's status in this tab (the leading tab's own, passed to the others), and since when. */
export function useStreamStatus(): StreamState {
  return useSyncExternalStore(watch, current, current);
}

export function isStreamStatus(value: unknown): value is StreamStatus {
  return value === 'live' || value === 'reconnecting';
}
