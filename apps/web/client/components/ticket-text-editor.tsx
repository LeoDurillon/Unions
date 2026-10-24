// The ticket's title and description being edited on its Overview, saved to the issue by the worker.
import { useState, type ReactElement, type SubmitEvent } from 'react';

import type { TicketDetail } from '../../src/api-types';
import { originName } from '../lib/ticket-origin';
import { useTicketEdit, type TicketText } from '../lib/use-ticket-edit';
import { Button, ErrorText, Field, inputClass } from './ui';

type Ticket = TicketDetail['ticket'];

/** Where the edit goes, and where it does not. */
function hintFor(ticket: Ticket): string {
  const issue =
    ticket.issueNumber === null
      ? 'The GitHub issue is created with it.'
      : `Saved to issue #${ticket.issueNumber} on GitHub too.`;
  const origin = originName(ticket.originKind);
  const notion = origin ? ` The ${origin} is not changed.` : '';
  return `Markdown. ${issue}${notion} Steps already done do not run again.`;
}

export function TicketTextEditor({
  ticket,
  base,
  onDone,
}: {
  ticket: Ticket;
  /** The text when the edit was opened: the worker refuses the edit when GitHub changed it since. */
  base: TicketText;
  /** Saved or cancelled. */
  onDone: () => void;
}): ReactElement {
  const [title, setTitle] = useState(base.title);
  const [body, setBody] = useState(base.body);
  const edit = useTicketEdit(ticket.id, onDone);
  const unchanged = title.trim() === base.title && body === base.body;

  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    edit.save({ title, body }, base);
  };

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Edit the ticket">
      <Field label="Title">
        <input
          className={inputClass}
          value={title}
          required
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </Field>
      <Field label="Description" hint={hintFor(ticket)}>
        <textarea
          className={`${inputClass} min-h-60 font-mono`}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
      </Field>
      <ErrorText error={edit.error} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={edit.saving || unchanged}>
          {edit.saving ? 'Saving…' : 'Save'}
        </Button>
        <Button disabled={edit.saving} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
