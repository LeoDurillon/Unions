// Work the worker finishes later: the request is sent, then waited on until the ticket's done or failed event comes in.

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { useEvents } from '../app/use-event-stream';

export type QueuedWork<T> = {
  start: (input: T) => void;
  /** Sent, or queued and the worker has not finished it yet. */
  busy: boolean;
  error: Error | null;
};

function errorOf(payload: unknown, fallback: string): string {
  const error =
    typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : null;
  return typeof error === 'string' ? error : fallback;
}

/** `send` queues it; the event `done` (then `onDone` runs) or `failed` (its `error` shows) ends it. */
export function useQueuedWork<T>(work: {
  ticketId: number;
  send: (input: T) => Promise<unknown>;
  events: { done: string; failed: string };
  fallback: string;
  onDone: () => void;
}): QueuedWork<T> {
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const mutation = useMutation({
    mutationFn: work.send,
    onMutate: () => {
      setFailure(null);
    },
    onSuccess: () => {
      setWaiting(true);
    },
  });
  useEvents((event) => {
    if (!waiting || event.ticketId !== work.ticketId) {
      return;
    }
    if (event.type === work.events.done) {
      setWaiting(false);
      work.onDone();
    } else if (event.type === work.events.failed) {
      setWaiting(false);
      setFailure(new Error(errorOf(event.payload, work.fallback)));
    }
  });
  return {
    start: (input) => {
      mutation.mutate(input);
    },
    busy: mutation.isPending || waiting,
    error: mutation.error ?? failure,
  };
}
