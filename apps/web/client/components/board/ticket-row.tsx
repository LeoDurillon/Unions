// A finished ticket on one line, for the Done and Merged / Closed columns: how it ended, its title, its PR.

import type { ReactElement } from 'react';

import type { TicketSummary } from '../../../src/api-types';

/** Green once its PR merged or its checks passed; grey while closed or not known. */
function dotClass(ticket: TicketSummary): string {
  if (ticket.prState === 'merged' || ticket.prChecksState === 'success') {
    return 'bg-emerald-500';
  }
  if (ticket.prChecksState === 'pending') {
    return 'bg-amber-500';
  }
  return 'bg-zinc-300 dark:bg-zinc-600';
}

function rowTitle(ticket: TicketSummary): string {
  if (ticket.prState === 'merged') {
    return 'Merged';
  }
  if (ticket.prState === 'closed') {
    return 'Closed';
  }
  return ticket.prChecksState === null ? 'Done' : `Done · checks ${ticket.prChecksState}`;
}

export function TicketRow({
  ticket,
  onOpen,
}: {
  ticket: TicketSummary;
  onOpen: (id: number) => void;
}): ReactElement {
  return (
    <li className="border-t border-zinc-100 first:border-t-0 dark:border-zinc-800">
      <button
        type="button"
        title={`${ticket.title} (${rowTitle(ticket)})`}
        onClick={() => {
          onOpen(ticket.id);
        }}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      >
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dotClass(ticket)}`} />
        <span className="min-w-0 flex-1 truncate font-medium">{ticket.title}</span>
        <span className="font-mono text-[10.5px] text-zinc-500">
          {ticket.prNumber === null ? '' : `#${ticket.prNumber}`}
        </span>
      </button>
    </li>
  );
}
