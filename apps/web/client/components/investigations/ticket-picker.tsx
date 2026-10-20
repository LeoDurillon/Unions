import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { refLabel } from '../../lib/labels';
import { inputClass } from '../ui';

const ROW_ON = 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100';
const ROW_OFF = 'hover:bg-zinc-100 dark:hover:bg-zinc-800';

type Choice = { id: number; label: string; running: boolean };

/** A ticket's line: its reference and its whole title, searched as typed. */
function choiceOf(ticket: {
  id: number;
  issueNumber: number | null;
  title: string;
  phase: { kind: string };
}): Choice {
  return {
    id: ticket.id,
    label: `${refLabel(ticket)} · ${ticket.title}`,
    running: ticket.phase.kind === 'running',
  };
}

/**
 * The project's tickets that have a workspace to read (not cancelled), newest first. A list rather
 * than a `<select>`: the browser's dropdown cuts long titles, here they wrap.
 */
export function TicketPicker({
  projectId,
  value,
  onChange,
}: {
  projectId: number;
  value: number | null;
  onChange: (ticketId: number | null) => void;
}): ReactElement {
  const [filter, setFilter] = useState('');
  const tickets = useQuery({
    queryKey: ['tickets', projectId],
    queryFn: () => api.tickets(projectId),
  });
  const needle = filter.trim().toLowerCase();
  const choices = (tickets.data ?? [])
    .filter((ticket) => ticket.phase.kind !== 'cancelled')
    .toSorted((a, b) => b.id - a.id)
    .map((ticket) => choiceOf(ticket))
    .filter((choice) => choice.id === value || choice.label.toLowerCase().includes(needle));
  return (
    <div className="space-y-1">
      <input
        aria-label="Filter tickets"
        className={inputClass}
        value={filter}
        placeholder="Filter tickets…"
        onChange={(event) => {
          setFilter(event.target.value);
        }}
      />
      <fieldset
        aria-label="Ticket"
        className="max-h-56 overflow-y-auto rounded-md border border-zinc-300 dark:border-zinc-700"
      >
        {choices.length === 0 ? (
          <p className="px-3 py-2 text-sm text-zinc-500">No ticket matches.</p>
        ) : null}
        {choices.map((choice) => (
          <label
            key={choice.id}
            className={`relative block cursor-pointer px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 has-[:focus-visible]:ring-inset ${choice.id === value ? ROW_ON : ROW_OFF}`}
          >
            <input
              type="radio"
              name="investigation-ticket"
              className="sr-only"
              checked={choice.id === value}
              onChange={() => {
                onChange(choice.id);
              }}
            />
            {choice.label}
            {choice.running ? <span className="ml-1 text-zinc-500">(running a step)</span> : null}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
