// One board column: its title, count and fold button over its cards, a drop target; or, folded, a
// narrow strip that unfolds on a click.
import { useDroppable } from '@dnd-kit/core';
import type { BoardColumn } from '@union/core';
import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { TicketCard } from './ticket-card';

type Config = PublicProject['config'];

const FOLD_BUTTON =
  'rounded px-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

/** A folded column: a narrow strip with its title and count, that unfolds on a click. */
export function FoldedColumn({
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

export function Column({
  status,
  title,
  tickets,
  config,
  onOpen,
  onFold,
}: {
  status: BoardColumn;
  title: string;
  tickets: TicketSummary[];
  config?: Config;
  onOpen: (id: number) => void;
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
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} config={config} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
