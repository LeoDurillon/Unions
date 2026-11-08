// The board's columns: each its title, count and fold button over its cards (or, folded, a narrow strip
// that unfolds on a click); empty ones say so, and placeholder cards stand in while the board loads.
import type { BoardColumn } from '@union/core';
import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { COLUMNS } from '../lib/labels';
import { useFoldedColumns } from '../lib/use-folded-columns';
import type { StartState } from '../lib/use-start-tickets';
import { TicketCard } from './ticket-card';

type Config = PublicProject['config'];

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

/** A folded column: a narrow strip with its title and count, that unfolds on a click. */
function FoldedColumn({
  title,
  count,
  onUnfold,
}: {
  title: string;
  count: number;
  onUnfold: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      title={`Show ${title}`}
      aria-label={`Show ${title}, ${count} tickets`}
      onClick={onUnfold}
      className="flex h-full w-10 shrink-0 flex-col items-center gap-2 rounded-xl bg-zinc-100 py-3 text-sm font-semibold hover:bg-zinc-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-800"
    >
      <span className="text-xs font-normal text-zinc-500">{count}</span>
      <span className="[writing-mode:vertical-rl]">{title}</span>
    </button>
  );
}

/** Two grey cards that pulse while the board's tickets are read. */
function Placeholders(): ReactElement {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {[0, 1].map((key) => (
        <div
          key={key}
          className="h-20 animate-pulse rounded-lg bg-zinc-200/80 dark:bg-zinc-800/80"
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
    <p className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
      {view.filtering ? 'None matches the filter' : EMPTY[status]}
    </p>
  );
}

/** How the board is shown: filtered, still loading, and what the Start buttons started. */
type ColumnView = {
  filtering: boolean;
  loading: boolean;
  config?: Config;
  started?: StartState;
};

function Column({
  status,
  title,
  tickets,
  view,
  onOpen,
  onFold,
}: {
  status: BoardColumn;
  title: string;
  tickets: TicketSummary[];
  view: ColumnView;
  onOpen: (id: number) => void;
  onFold: () => void;
}): ReactElement {
  const { started } = view;
  return (
    <section className="flex h-full min-w-52 flex-1 flex-col gap-2 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900/60">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="text-xs font-normal text-zinc-500">{tickets.length}</span>
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
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {tickets.length === 0 ? <EmptyColumn status={status} view={view} /> : null}
        {tickets.map((ticket) => (
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
      </div>
    </section>
  );
}

/** The columns, each with its tickets, or folded to a strip (remembered in this browser). */
export function BoardColumns({
  tickets,
  config,
  filtering,
  loading,
  onOpen,
  started,
}: {
  tickets: TicketSummary[];
  config?: Config;
  filtering: boolean;
  loading: boolean;
  onOpen: (id: number) => void;
  started?: StartState;
}): ReactElement {
  const view: ColumnView = { filtering, loading, config, started };
  const columns = useFoldedColumns();
  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
      {COLUMNS.map(({ status, title }) => {
        const inColumn = tickets.filter((ticket) => ticket.board === status);
        const toggle = (): void => {
          columns.toggle(status);
        };
        return columns.folded(status) ? (
          <FoldedColumn key={status} title={title} count={inColumn.length} onUnfold={toggle} />
        ) : (
          <Column
            key={status}
            status={status}
            title={title}
            tickets={inColumn}
            view={view}
            onOpen={onOpen}
            onFold={toggle}
          />
        );
      })}
    </div>
  );
}
