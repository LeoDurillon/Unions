// Saves the ticket's edited title and description: queued for the worker, done when its event comes in.
import { request } from './api';
import { useQueuedWork } from './use-queued-work';

export type TicketText = { title: string; body: string };

export type TicketEditState = {
  save: (text: TicketText, base: TicketText) => void;
  /** Sent, or queued and the worker has not written it yet. */
  saving: boolean;
  error: Error | null;
};

/** `onSaved` runs once the worker wrote the edit (to the issue too, when the ticket has one). */
export function useTicketEdit(ticketId: number, onSaved: () => void): TicketEditState {
  const work = useQueuedWork({
    ticketId,
    send: (input: { text: TicketText; base: TicketText }): Promise<unknown> =>
      request('PUT', `/api/tickets/${ticketId}/text`, { ...input.text, base: input.base }),
    events: { done: 'ticket_edited', failed: 'ticket_edit_failed' },
    fallback: 'The edit was not saved',
    onDone: onSaved,
  });
  return {
    save: (text, base) => {
      work.start({ text, base });
    },
    saving: work.busy,
    error: work.error,
  };
}
