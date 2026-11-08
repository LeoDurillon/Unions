// The event log's types: a typed event to write, and a guard that narrows an event read back.
import type { EventPayloads } from './event-payloads';

export type { EventPayloads } from './event-payloads';

export type EventType = keyof EventPayloads;

/** An event to log: its payload is the one its `type` carries. */
export type NewEvent = {
  [T in EventType]: {
    type: T;
    ticketId?: number;
    runId?: number;
    investigationId?: number;
    payload: EventPayloads[T];
  };
}[EventType];

/** An event as read back from the log or the stream. */
export type StoredEvent = { type: string; payload: unknown };

/**
 * Whether `event` is of `type`, with its payload typed. Every event is written by `emitEvent` from
 * a `NewEvent`, so the payload is trusted to match; a row older than a payload change may lack a
 * field added since.
 */
export function isEvent<E extends StoredEvent, T extends EventType>(
  event: E,
  type: T,
): event is E & { type: T; payload: EventPayloads[T] } {
  return event.type === type;
}
