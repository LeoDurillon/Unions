// Setting a property of a ticket's tracker item by hand: queued for the worker, followed by its events.
// The tab's view (`queryKey`) shows the change "Saving…" until the worker answers, then is read again.

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { PendingTrackerField } from '../../../src/tracker-field-types';
import { request } from '../app/api';
import { useEvents } from '../app/use-event-stream';

/** A tab's view that lists the properties being set. */
type WithPendingFields = { pendingFields: PendingTrackerField[] };

export type TrackerFieldSend = {
  /** Queues the change; resolves once queued (the editor closes), rejects with the server's reason. */
  send: (fieldId: string, value: string, text: string) => Promise<void>;
  /** The tracker's reason for each property it refused, by id. */
  failures: ReadonlyMap<string, string>;
  dismiss: (fieldId: string) => void;
};

function failureOf(payload: unknown): { fieldId: string; error: string } | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const fieldId = 'fieldId' in payload ? payload.fieldId : null;
  const error = 'error' in payload ? payload.error : null;
  return typeof fieldId === 'string' && typeof error === 'string' ? { fieldId, error } : null;
}

export function useTrackerFieldSend(ticketId: number, queryKey: unknown[]): TrackerFieldSend {
  const client = useQueryClient();
  const [failures, setFailures] = useState<ReadonlyMap<string, string>>(new Map());
  const dismiss = (fieldId: string): void => {
    setFailures((old) => new Map([...old].filter(([one]) => one !== fieldId)));
  };
  useEvents((event) => {
    if (event.ticketId !== ticketId || !event.type.startsWith('tracker_field_')) {
      return;
    }
    const failure = event.type === 'tracker_field_failed' ? failureOf(event.payload) : null;
    if (failure) {
      setFailures((old) => new Map(old).set(failure.fieldId, failure.error));
    }
    void client.invalidateQueries({ queryKey });
  });
  return {
    send: async (fieldId, value, text) => {
      const { id } = await request<{ id: number }>(
        'POST',
        `/api/tickets/${ticketId}/tracker-fields`,
        {
          fieldId,
          value,
          text,
        },
      );
      dismiss(fieldId);
      client.setQueryData<WithPendingFields>(queryKey, (old) =>
        old
          ? {
              ...old,
              pendingFields: [
                ...old.pendingFields,
                { commandId: id, fieldId, text, createdAt: Date.now() },
              ],
            }
          : old,
      );
    },
    failures,
    dismiss,
  };
}
