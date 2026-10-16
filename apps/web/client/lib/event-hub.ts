import type { EventRow } from '../../src/api-types';

/**
 * One event stream for the whole browser, shared by every Union tab and every view in them.
 *
 * Browsers open at most six HTTP/1.1 connections per host, and an event stream holds one for good:
 * with a stream per tab and per log, a few tabs used them all, and a click's request then waited
 * for a free connection (it looked like the action needed a second click). Here one tab holds the
 * stream (the Web Lock `union-events`) and passes each event to the others over a BroadcastChannel;
 * when that tab closes, another takes the lock and resumes after the last event it saw.
 */

type Listener = (event: EventRow) => void;

const LOCK = 'union-events';
const listeners = new Set<Listener>();
/** Called only in the tab that holds the stream: what must happen once per browser. */
const leadListeners = new Set<Listener>();
let started = false;
let lastSeq = 0;
let channel: BroadcastChannel | null = null;

export function isEventRow(value: unknown): value is EventRow {
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

/** This tab holds the stream: it reads it, keeps the events, and passes them to the other tabs. */
function lead(): void {
  const source = new EventSource(`/api/events?after=${lastSeq === 0 ? 'latest' : lastSeq}`);
  source.addEventListener('message', (message: MessageEvent<string>) => {
    const row: unknown = JSON.parse(message.data);
    if (isEventRow(row)) {
      deliver(row, [listeners, leadListeners]);
      // A BroadcastChannel has no target origin: the rule is for `window.postMessage`.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      channel?.postMessage(row);
    }
  });
}

function start(): void {
  started = true;
  channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(LOCK);
  channel?.addEventListener('message', (message: MessageEvent<unknown>) => {
    if (isEventRow(message.data)) {
      deliver(message.data, [listeners]);
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
