import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Investigation } from '@union/core';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { Switch } from '../choice';
import { Button, ErrorText, inputClass } from '../ui';

function NotionOption({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <Switch
      checked={checked}
      onChange={onChange}
      hint="A page with the ticket's title and description, in the project's Notion data source; the ticket is linked to it."
    >
      Also create it in Notion
    </Switch>
  );
}

function Ask({
  investigation,
  hasNotion,
  onCancel,
}: {
  investigation: Investigation;
  hasNotion: boolean;
  onCancel: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const [context, setContext] = useState('');
  const [inNotion, setInNotion] = useState(false);
  const ask = useMutation({
    mutationFn: () => api.requestInvestigationTicket(investigation, { context, inNotion }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['investigations'] }),
  });
  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">What should the ticket cover?</span>
        <span className="block text-xs text-zinc-500">
          Optional. An agent writes the ticket from the whole investigation and this, in the
          language you wrote in; it lands in the Backlog.
          {investigation.scope === 'ticket' && investigation.onTicketId !== null
            ? ' It depends on the ticket investigated: it starts once that one is done, from its branch.'
            : ''}
        </span>
        <textarea
          className={`${inputClass} min-h-20`}
          placeholder="e.g. Only the backend fix; leave the UI for later."
          value={context}
          onChange={(event) => {
            setContext(event.target.value);
          }}
        />
      </label>
      {hasNotion ? <NotionOption checked={inNotion} onChange={setInNotion} /> : null}
      <ErrorText error={ask.error} />
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={ask.isPending}
          onClick={() => {
            ask.mutate();
          }}
        >
          Write the ticket
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/** Why the ticket failed, or why it has no Notion page though it was asked there. */
function TicketError({
  status,
  error,
}: {
  status: Investigation['ticketStatus'];
  error: string | null;
}): ReactElement | null {
  if (status === 'failed') {
    return (
      <p className="text-sm text-red-700 dark:text-red-400">
        The ticket could not be written: {error}
      </p>
    );
  }
  return error === null ? null : (
    <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
  );
}

/** Turns the investigation into a backlog ticket written by an agent, and links to it once made. */
export function InvestigationTicket({
  investigation,
  hasNotion,
  onOpenTicket,
}: {
  investigation: Investigation;
  hasNotion: boolean;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const [asking, setAsking] = useState(false);
  const { ticketStatus, ticketId, ticketError } = investigation;
  if (ticketStatus === 'queued' || ticketStatus === 'running') {
    return <p className="text-sm text-blue-700 dark:text-blue-300">Writing the ticket…</p>;
  }
  if (asking) {
    return (
      <Ask
        investigation={investigation}
        hasNotion={hasNotion}
        onCancel={() => {
          setAsking(false);
        }}
      />
    );
  }
  return (
    <div className="space-y-2">
      <TicketError status={ticketStatus} error={ticketError} />
      <div className="flex flex-wrap items-center gap-2">
        {ticketId === null ? null : (
          <Button
            variant="primary"
            onClick={() => {
              onOpenTicket(ticketId);
            }}
          >
            Open ticket
          </Button>
        )}
        <Button
          onClick={() => {
            setAsking(true);
          }}
        >
          {ticketId === null ? 'Create ticket' : 'Create another ticket'}
        </Button>
      </div>
    </div>
  );
}
