import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement, type SubmitEvent } from 'react';

import { api } from '../lib/api';
import { Button, ErrorText, Field, inputClass } from './ui';

export function TicketForm({
  projectId,
  onCreated,
  initialTitle = '',
  initialBody = '',
}: {
  projectId: number;
  onCreated: (ticketId: number) => void;
  initialTitle?: string;
  initialBody?: string;
}): ReactElement {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);

  const create = useMutation({
    mutationFn: () => api.createTicket({ projectId, title, body }),
    onSuccess: async (ticket) => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      onCreated(ticket.id);
    },
  });

  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title">
        <input
          className={inputClass}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          required
        />
      </Field>
      <Field label="Description" hint="Markdown. This becomes the GitHub issue body.">
        <textarea
          className={`${inputClass} min-h-40 font-mono`}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
      </Field>
      <ErrorText error={create.error} />
      <Button type="submit" variant="primary" disabled={create.isPending}>
        {create.isPending ? 'Creating…' : 'Create ticket'}
      </Button>
    </form>
  );
}
