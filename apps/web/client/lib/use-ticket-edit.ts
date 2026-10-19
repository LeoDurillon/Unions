// Saves the ticket's edited title and description: queued for the worker, done when its event comes in.
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { request } from './api';
import { useEvents } from './use-event-stream';

export type TicketText = { title: string; body: string };

export type TicketEditState = {
  save: (text: TicketText, base: TicketText) => void;
  /** Sent, or queued and the worker has not written it yet. */
  saving: boolean;
  error: Error | null;
};

function errorOf(payload: unknown): string {
  const error =
    typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : null;
  return typeof error === 'string' ? error : 'The edit was not saved';
}

/** `onSaved` runs once the worker wrote the edit (to the issue too, when the ticket has one). */
export function useTicketEdit(ticketId: number, onSaved: () => void): TicketEditState {
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { text: TicketText; base: TicketText }): Promise<unknown> =>
      request('PUT', `/api/tickets/${ticketId}/text`, { ...input.text, base: input.base }),
    onMutate: () => {
      setFailure(null);
    },
    onSuccess: () => {
      setWaiting(true);
    },
  });
  useEvents((event) => {
    if (!waiting || event.ticketId !== ticketId) {
      return;
    }
    if (event.type === 'ticket_edited') {
      setWaiting(false);
      onSaved();
    } else if (event.type === 'ticket_edit_failed') {
      setWaiting(false);
      setFailure(new Error(errorOf(event.payload)));
    }
  });
  return {
    save: (text, base) => {
      mutation.mutate({ text, base });
    },
    saving: mutation.isPending || waiting,
    error: mutation.error ?? failure,
  };
}
