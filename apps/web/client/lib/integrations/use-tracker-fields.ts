// Setting a property of a tracker's item by hand, from a ticket's tab or a review's: queued, then followed by its events.
// The tab's view (`queryKey`) shows the change "Saving…" until the worker answers, then is read again.

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { EventRow } from '../../../src/api-types';
import type { PendingTrackerField } from '../../../src/tracker-field-types';
import { request } from '../app/api';
import { useEvents } from '../app/use-event-stream';
import type { TrackerDraft } from './tracker-draft';

/**
 * Where changes go: the route (`url`, with `body` added to each), the events that answer them
 * (`owns`), and the view showing them (`queryKey`, `addPending` adds one queued change to it).
 */
export type TrackerFieldTarget = {
  url: string;
  body: Record<string, unknown>;
  owns: (event: EventRow) => boolean;
  queryKey: unknown[];
  addPending: (old: unknown, pending: PendingTrackerField) => unknown;
};

export type TrackerFieldSend = {
  /** Queues the change; resolves once queued (the editor closes), rejects with the server's reason. */
  send: (fieldId: string, draft: TrackerDraft) => Promise<void>;
  /** The tracker's reason for each property it refused, by id. */
  failures: ReadonlyMap<string, string>;
  dismiss: (fieldId: string) => void;
};

/** The property a `tracker_field_failed` event names, and why it failed. */
function failureOf(payload: unknown): { fieldId: string; error: string } | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const fieldId = 'fieldId' in payload ? payload.fieldId : null;
  const error = 'error' in payload ? payload.error : null;
  return typeof fieldId === 'string' && typeof error === 'string' ? { fieldId, error } : null;
}

/** A tab's view that lists the properties being set (a ticket's, a review's item). */
export function hasPendingFields(view: unknown): view is { pendingFields: PendingTrackerField[] } {
  return (
    typeof view === 'object' &&
    view !== null &&
    'pendingFields' in view &&
    Array.isArray(view.pendingFields)
  );
}

/** A ticket's tab: its route, its events, and a view with `pendingFields`. */
export function ticketFieldTarget(ticketId: number, queryKey: unknown[]): TrackerFieldTarget {
  return {
    url: `/api/tickets/${ticketId}/tracker-fields`,
    body: {},
    owns: (event) => event.ticketId === ticketId,
    queryKey,
    addPending: (old, pending) =>
      hasPendingFields(old) ? { ...old, pendingFields: [...old.pendingFields, pending] } : old,
  };
}

export function useTrackerFieldSend(target: TrackerFieldTarget): TrackerFieldSend {
  const client = useQueryClient();
  const [failures, setFailures] = useState<ReadonlyMap<string, string>>(new Map());
  const dismiss = (fieldId: string): void => {
    setFailures((old) => new Map([...old].filter(([one]) => one !== fieldId)));
  };
  useEvents((event) => {
    if (!event.type.startsWith('tracker_field_') || !target.owns(event)) {
      return;
    }
    const failure = event.type === 'tracker_field_failed' ? failureOf(event.payload) : null;
    if (failure) {
      setFailures((old) => new Map(old).set(failure.fieldId, failure.error));
    }
    void client.invalidateQueries({ queryKey: target.queryKey });
  });
  return {
    send: async (fieldId, { value, text, picks }) => {
      const { id } = await request<{ id: number }>('POST', target.url, {
        ...target.body,
        fieldId,
        value,
        text,
        picks,
      });
      dismiss(fieldId);
      const pending = { commandId: id, fieldId, text, createdAt: Date.now() };
      client.setQueryData(target.queryKey, (old: unknown) => target.addPending(old, pending));
    },
    failures,
    dismiss,
  };
}
