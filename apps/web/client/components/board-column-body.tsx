// One unfolded column of the board: its title, count and fold button over its cards, sorted with what needs
// the user first; finished tickets that ask nothing more are one line each; empty, it says why.
import type { BoardColumn } from '@union/core';
import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { needsYou } from '../lib/board-filter';
import { orderColumn } from '../lib/board-order';
import type { StartState } from '../lib/use-start-tickets';
import { TicketCard } from './ticket-card';
import { TicketRow } from './ticket-row';

type Config = PublicProject['config'];

/** The columns whose tickets are finished: a line each is enough. */
const FINISHED: ReadonlySet<BoardColumn> = new Set(['done', 'merged']);

/** What an empty column says. */
const EMPTY: Record<BoardColumn, string> = {
  backlog: 'No ticket waiting',
  in_progress: 'Nothing running',
  in_review: 'Nothing to review',
  done: 'Nothing done yet',
  merged: 'Nothing merged lately',
};

const FOLD_BUTTON =
  'rounded px-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

/** Two grey cards that pulse while the board's tickets are read. */
function Placeholders(): ReactElement {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {[0, 1].map((key) => (
        <div
          key={key}
          className="h-24 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80"
        />
      ))}
    </div>
  );
}

/** What a column with no card shows: placeholders while loading, else why it is empty. */
function EmptyColumn({ status, view }: { status: BoardColumn; view: ColumnView }): ReactElement {
  if (view.loading) {
    return <Placeholders />;
  }
  return (
    <p className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-500">
      {view.filtering ? 'None matches the filter' : EMPTY[status]}
    </p>
  );
}

/** How the board is shown: filtered, still loading, and what the Start buttons started. */
export type ColumnView = {
  filtering: boolean;
  loading: boolean;
  config?: Config;
  started?: StartState;
};

function ColumnTitle({
  title,
  count,
  onFold,
}: {
  title: string;
  count: number;
  onFold: () => void;
}): ReactElement {
  return (
    <h2 className="flex items-center gap-2 px-0.5 text-[13px] font-semibold">
      <span className="truncate">{title}</span>
      <span className="rounded-full bg-white px-1.5 text-[11px] font-medium text-zinc-600 tabular-nums shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
        {count}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        title={`Fold ${title}`}
        aria-label={`Fold ${title}`}
        onClick={onFold}
        className={FOLD_BUTTON}
      >
        ‹
      </button>
    </h2>
  );
}

export function Column({
  status,
  title,
  tickets,
  view,
  onOpen,
  onFold,
  className = '',
}: {
  status: BoardColumn;
  title: string;
  tickets: TicketSummary[];
  view: ColumnView;
  onOpen: (id: number) => void;
  onFold: () => void;
  /** Hides it on a phone, where one column shows at a time. */
  className?: string;
}): ReactElement {
  const { started } = view;
  const ordered = orderColumn(tickets);
  // Finished tickets that ask nothing more go on one line each, under the cards.
  const rows = ordered.filter((ticket) => FINISHED.has(ticket.board) && !needsYou(ticket));
  const cards = ordered.filter((ticket) => !rows.includes(ticket));
  return (
    <section
      className={`flex h-full min-w-64 flex-1 flex-col gap-2.5 rounded-2xl bg-zinc-100/80 p-3 sm:max-w-sm dark:bg-zinc-900/60 ${className}`}
    >
      <ColumnTitle title={title} count={tickets.length} onFold={onFold} />
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-1 pt-0.5 pb-1">
        {tickets.length === 0 ? <EmptyColumn status={status} view={view} /> : null}
        {cards.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            config={view.config}
            onOpen={onOpen}
            onStart={started?.start}
            starting={started?.starting.has(ticket.id) === true}
            startError={started?.failures.get(ticket.id) ?? null}
          />
        ))}
        {rows.length > 0 ? (
          <ul className="shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            {rows.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} onOpen={onOpen} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
