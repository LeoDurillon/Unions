// The browser's one shared event stream, handed to every listener in any tab.

import type { EventRow } from '../../../src/api-types';
import {
  isStreamStatus,
  reconnectDelay,
  setStreamStatus,
  type StreamStatus,
} from './stream-status';

/**
 * One event stream for the whole browser, shared by every Union tab and every view in them.
 *
 * Browsers open at most six HTTP/1.1 connections per host, and an event stream holds one for good:
 * with a stream per tab and per log, a few tabs used them all, and a click's request then waited
 * for a free connection (it looked like the action needed a second click). Here one tab holds the
 * stream (the Web Lock `union-events`) and passes each event to the others over a BroadcastChannel;
 * when that tab closes, another takes the lock and resumes after the last event it saw.
 *
 * A stream the server answers with an error (the API restarting behind Vite's proxy answers 502) is
 * closed for good by the browser: the leading tab reopens it after a backoff, from the last event it
 * saw, and tells the other tabs it is reconnecting.
 */

type Listener = (event: EventRow) => void;

const LOCK = 'union-events';
const listeners = new Set<Listener>();
/** Called only in the tab that holds the stream: what must happen once per browser. */
const leadListeners = new Set<Listener>();
let started = false;
let lastSeq = 0;
let channel: BroadcastChannel | null = null;
let source: EventSource | null = null;
let attempt = 0;
let reopenTimer: ReturnType<typeof setTimeout> | null = null;
/** When the stream last said anything (an event, the server's `ping`, its opening). */
let heardAt = 0;
/** Three of the server's 15 s heartbeats missed: the connection is dead even if the browser thinks not. */
const SILENT_MS = 45_000;
const WATCH_MS = 5000;

/** What the leading tab tells the others besides events. */
type StatusMessage = { kind: 'stream_status'; status: StreamStatus };

function isStatusMessage(value: unknown): value is StatusMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'stream_status' &&
    'status' in value &&
    isStreamStatus(value.status)
  );
}

/** Sets this tab's stream status and passes it to the other tabs. */
function announce(status: StreamStatus): void {
  setStreamStatus(status);
  const message: StatusMessage = { kind: 'stream_status', status };
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
  channel?.postMessage(message);
}

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

/** Hands an event to this tab's listeners once, in order (a seq already seen is dropped). */
function deliver(event: EventRow, listening: Set<Listener>[]): void {
  if (event.seq <= lastSeq) {
    return;
  }
  lastSeq = event.seq;
  for (const set of listening) {
    for (const listener of set) {
      listener(event);
    }
  }
}

/** Reopens the stream now, unless it is open or connecting (the browser retries a dropped one itself). */
function reopenNow(): void {
  if (source && source.readyState !== EventSource.CLOSED) {
    return;
  }
  if (reopenTimer !== null) {
    clearTimeout(reopenTimer);
    reopenTimer = null;
  }
  open();
}

function scheduleReopen(): void {
  if (reopenTimer !== null) {
    return;
  }
  reopenTimer = setTimeout(() => {
    reopenTimer = null;
    attempt += 1;
    open();
  }, reconnectDelay(attempt));
}

/** Opens the stream after the last event this tab saw; the server replays what was missed. */
function open(): void {
  const opened = new EventSource(`/api/events?after=${lastSeq === 0 ? 'latest' : lastSeq}`);
  source = opened;
  heardAt = Date.now();
  const heard = (): void => {
    heardAt = Date.now();
  };
  opened.addEventListener('open', () => {
    heard();
    attempt = 0;
    announce('live');
  });
  opened.addEventListener('ping', heard);
  opened.addEventListener('error', () => {
    announce('reconnecting');
    if (opened.readyState === EventSource.CLOSED) {
      scheduleReopen();
    }
  });
  opened.addEventListener('message', (message: MessageEvent<string>) => {
    heard();
    const row: unknown = JSON.parse(message.data);
    if (isEventRow(row)) {
      deliver(row, [listeners, leadListeners]);
      // A BroadcastChannel has no target origin: the rule is for `window.postMessage`.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      channel?.postMessage(row);
    }
  });
}

/** Closes and reopens an open stream that went silent: its server is gone behind the proxy. */
function dropSilent(): void {
  if (source?.readyState !== EventSource.OPEN || Date.now() - heardAt < SILENT_MS) {
    return;
  }
  source.close();
  announce('reconnecting');
  scheduleReopen();
}

/** This tab holds the stream: it reads it, keeps the events, and passes them to the other tabs. */
function lead(): void {
  open();
  setInterval(dropSilent, WATCH_MS);
  // Back online, or back to the tab: no need to wait out the backoff.
  globalThis.addEventListener('online', reopenNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      reopenNow();
    }
  });
}

function start(): void {
  started = true;
  channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(LOCK);
  channel?.addEventListener('message', (message: MessageEvent<unknown>) => {
    if (isEventRow(message.data)) {
      deliver(message.data, [listeners]);
    } else if (isStatusMessage(message.data)) {
      setStreamStatus(message.data.status);
    }
  });
  if (!('locks' in navigator) || !channel) {
    // Without locks or channels each tab keeps its own stream, as before.
    lead();
    return;
  }
  // Granted to one tab at a time; the holder never releases it until the tab closes.
  void navigator.locks.request(
    LOCK,
    () =>
      new Promise<void>(() => {
        lead();
      }),
  );
}

/** Calls `listener` with every new event, in any tab's stream; returns the unsubscribe. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (!started) {
    start();
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Calls `listener` with the events only while this tab holds the stream, so one tab in the browser
 * acts on each (a desktop notification is shown once); returns the unsubscribe.
 */
export function subscribeAsLead(listener: Listener): () => void {
  leadListeners.add(listener);
  const stop = subscribe(() => {
    // Subscribing starts the stream; the events come through `leadListeners`.
  });
  return () => {
    leadListeners.delete(listener);
    stop();
  };
}
