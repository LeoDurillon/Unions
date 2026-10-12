import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { api } from '../lib/api';
import { refLabel } from '../lib/labels';
import { inputClass } from './ui';

/** Select the ticket this one builds on, among the project's other tickets. */
export function ParentPicker({
  projectId,
  ticketId,
  value,
  disabled = false,
  onChange,
}: {
  projectId: number;
  /** The ticket being edited, left out of the choices; null for a new ticket. */
  ticketId: number | null;
  value: number | null;
  disabled?: boolean;
  onChange: (parentId: number | null) => void;
}): ReactElement {
  const tickets = useQuery({
    queryKey: ['tickets', projectId],
    queryFn: () => api.tickets(projectId),
  });
  const choices = (tickets.data ?? []).filter(
    (ticket) => ticket.id !== ticketId && ticket.phase.kind !== 'cancelled',
  );
  return (
    <select
      className={inputClass}
      aria-label="Depends on"
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => {
        onChange(event.target.value === '' ? null : Number(event.target.value));
      }}
    >
      <option value="">No parent: starts from the base branch</option>
      {choices.map((ticket) => (
        <option key={ticket.id} value={ticket.id}>
          {refLabel(ticket)} · {ticket.title}
          {ticket.phase.kind === 'done' ? ' (done)' : ''}
        </option>
      ))}
    </select>
  );
}
