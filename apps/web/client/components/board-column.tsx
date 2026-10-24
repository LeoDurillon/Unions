// The board's columns: each its title, count and fold button over its cards, a drop target (or, folded,
// a narrow strip that unfolds on a click); empty ones say so.
import { useDroppable } from '@dnd-kit/core';
import type { BoardColumn } from '@union/core';
import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { COLUMNS } from '../lib/labels';
import { useFoldedColumns } from '../lib/use-folded-columns';
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

function Column({
  status,
  title,
  tickets,
  config,
  filtering,
  onOpen,
  onStart,
  onFold,
}: {
  status: BoardColumn;
  title: string;
  tickets: TicketSummary[];
  config?: Config;
  /** The board's filter is on: an empty column says so. */
  filtering: boolean;
  onOpen: (id: number) => void;
  onStart?: (id: number) => void;
  onFold: () => void;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={`flex h-full min-w-52 flex-1 flex-col gap-2 rounded-xl p-3 transition ${isOver ? 'bg-indigo-100 dark:bg-indigo-950' : 'bg-zinc-100 dark:bg-zinc-900/60'}`}
    >
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
        {tickets.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
            {filtering ? 'None matches the filter' : EMPTY[status]}
          </p>
        ) : null}
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            config={config}
            onOpen={onOpen}
            onStart={onStart}
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
  onOpen,
  onStart,
}: {
  tickets: TicketSummary[];
  config?: Config;
  filtering: boolean;
  onOpen: (id: number) => void;
  onStart?: (id: number) => void;
}): ReactElement {
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
            config={config}
            filtering={filtering}
            onOpen={onOpen}
            onStart={onStart}
            onFold={toggle}
          />
        );
      })}
    </div>
  );
}
