import { useQuery } from '@tanstack/react-query';
import type { InvestigationScope } from '@union/core';
import type { ReactElement } from 'react';

import { api } from '../../lib/api';
import { refLabel } from '../../lib/labels';
import { inputClass } from '../ui';
import { SCOPE_LABELS } from './investigation-labels';

const CHOICE_ON = 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40';
const CHOICE_OFF = 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800';
const SCOPES: readonly InvestigationScope[] = ['repository', 'ticket', 'global'];

/** The project's tickets that have a workspace to read (not cancelled), newest first. */
function TicketPicker({
  projectId,
  value,
  onChange,
}: {
  projectId: number;
  value: number | null;
  onChange: (ticketId: number | null) => void;
}): ReactElement {
  const tickets = useQuery({
    queryKey: ['tickets', projectId],
    queryFn: () => api.tickets(projectId),
  });
  const choices = (tickets.data ?? [])
    .filter((ticket) => ticket.phase.kind !== 'cancelled')
    .toSorted((a, b) => b.id - a.id);
  return (
    <select
      aria-label="Ticket"
      className={inputClass}
      value={value ?? ''}
      onChange={(event) => {
        onChange(event.target.value === '' ? null : Number(event.target.value));
      }}
    >
      <option value="">Pick a ticket…</option>
      {choices.map((ticket) => (
        <option key={ticket.id} value={ticket.id}>
          {refLabel(ticket)} · {ticket.title}
          {ticket.phase.kind === 'running' ? ' (running a step)' : ''}
        </option>
      ))}
    </select>
  );
}

/** Repository (with the clone's name), a ticket's workspace (with the ticket), or a global subject. */
export function ScopeField({
  value,
  repository,
  onChange,
  projectId,
  ticketId,
  onTicket,
}: {
  value: InvestigationScope;
  repository: string;
  onChange: (scope: InvestigationScope) => void;
  projectId: number;
  ticketId: number | null;
  onTicket: (ticketId: number | null) => void;
}): ReactElement {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">Scope</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {SCOPES.map((scope) => (
          <label
            key={scope}
            className={`relative cursor-pointer rounded-lg border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${value === scope ? CHOICE_ON : CHOICE_OFF}`}
          >
            <input
              type="radio"
              name="investigation-scope"
              className="sr-only"
              checked={value === scope}
              onChange={() => {
                onChange(scope);
              }}
            />
            <span className="block text-sm font-medium">
              {SCOPE_LABELS[scope].title}
              {scope === 'repository' ? (
                <span className="ml-1 font-normal text-zinc-500">{repository}</span>
              ) : null}
            </span>
            <span className="block text-xs text-zinc-500">{SCOPE_LABELS[scope].description}</span>
          </label>
        ))}
      </div>
      {value === 'ticket' ? (
        <TicketPicker projectId={projectId} value={ticketId} onChange={onTicket} />
      ) : null}
    </fieldset>
  );
}
