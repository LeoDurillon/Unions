// Above the board's columns: the tickets that need the user, one small card each saying what to do; a click opens it.

import type { ReactElement } from 'react';

import type { TicketSummary } from '../../../src/api-types';
import { needsYou } from '../../lib/board/board-filter';
import { orderColumn } from '../../lib/board/board-order';
import { COLUMNS, refLabel } from '../../lib/board/labels';
import { needsYouAction, type NeedsYouAction } from '../../lib/board/needs-you-action';
import { useCustomAgentNames } from '../../lib/union-settings/use-custom-agents';

/** More than this many: the rest are behind "+N more", which shows them all on the board. */
const SHOWN = 4;

const TONES: Record<NeedsYouAction['tone'], { icon: string; mark: string; text: string }> = {
  amber: {
    icon: '!',
    mark: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    text: 'text-amber-800 dark:text-amber-300',
  },
  red: {
    icon: '×',
    mark: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    text: 'text-red-700 dark:text-red-400',
  },
};

/** In the board's order: column by column, and within one as the column sorts them (as `n` walks them). */
function waiting(tickets: TicketSummary[]): TicketSummary[] {
  return COLUMNS.flatMap(({ status }) =>
    orderColumn(tickets.filter((ticket) => ticket.board === status && needsYou(ticket))),
  );
}

function StripCard({
  ticket,
  onOpen,
}: {
  ticket: TicketSummary;
  onOpen: (id: number) => void;
}): ReactElement {
  const names = useCustomAgentNames();
  const action = needsYouAction(ticket, names);
  const tone = TONES[action.tone];
  return (
    <button
      type="button"
      title={ticket.title}
      onClick={() => {
        onOpen(ticket.id);
      }}
      className={`flex min-w-0 items-start gap-3 rounded-xl border bg-white px-3.5 py-3 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md dark:bg-zinc-900 ${action.tone === 'amber' ? 'border-amber-300 dark:border-amber-800' : 'border-zinc-200 dark:border-zinc-800'}`}
    >
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${tone.mark}`}
      >
        {tone.icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`text-[12.5px] font-semibold ${tone.text}`}>{action.text}</span>
        <span className="line-clamp-2 text-[12.5px] font-medium">{ticket.title}</span>
        <span className="font-mono text-[11px] text-zinc-500">
          {refLabel(ticket)}
          {ticket.prNumber === null ? '' : ` · PR #${ticket.prNumber}`}
        </span>
      </span>
    </button>
  );
}

/** Nothing when no ticket needs the user. */
export function NeedsYouStrip({
  tickets,
  onOpen,
  onShowAll,
}: {
  tickets: TicketSummary[];
  onOpen: (id: number) => void;
  /** Shows only the tickets that need the user on the board. */
  onShowAll: () => void;
}): ReactElement | null {
  const all = waiting(tickets);
  if (all.length === 0) {
    return null;
  }
  const more = all.length - SHOWN;
  return (
    // On a phone the toolbar's "N need you" toggle stands in for it.
    <section aria-label="Needs you" className="space-y-2 max-sm:hidden">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold">Needs you</h2>
        <span className="text-xs text-zinc-500">{all.length}</span>
        {more > 0 ? (
          <button
            type="button"
            className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
            onClick={onShowAll}
          >
            +{more} more
          </button>
        ) : null}
        <span className="ml-auto text-xs text-zinc-500">
          Press{' '}
          <kbd className="rounded border border-current px-1 font-mono text-[10px] opacity-70">
            N
          </kbd>{' '}
          to open the first
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
        {all.slice(0, SHOWN).map((ticket) => (
          <StripCard key={ticket.id} ticket={ticket} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
