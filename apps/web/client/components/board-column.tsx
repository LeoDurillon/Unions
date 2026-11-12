// The board's columns side by side, each unfolded (`board-column-body.tsx`) or folded to a narrow strip that
// unfolds on a click; on a phone, one column at a time, picked above them.
import type { BoardColumn } from '@union/core';
import { Fragment, useState, type ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { COLUMNS } from '../lib/labels';
import { useFoldedColumns } from '../lib/use-folded-columns';
import type { StartState } from '../lib/use-start-tickets';
import { Column, type ColumnView } from './board-column-body';
import { ColumnSwitcher } from './column-switcher';

type Config = PublicProject['config'];

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
      className="flex h-full w-10 shrink-0 flex-col items-center gap-2 rounded-2xl bg-zinc-100/80 py-3 max-sm:hidden text-sm font-semibold hover:bg-zinc-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-800"
    >
      <span className="text-xs font-normal text-zinc-500">{count}</span>
      <span className="[writing-mode:vertical-rl]">{title}</span>
    </button>
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
  const [phone, setPhone] = useState<BoardColumn>('in_progress');
  return (
    <>
      <ColumnSwitcher tickets={tickets} current={phone} onPick={setPhone} />
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
        {COLUMNS.map(({ status, title }) => {
          const inColumn = tickets.filter((ticket) => ticket.board === status);
          const toggle = (): void => {
            columns.toggle(status);
          };
          const folded = columns.folded(status);
          // On a phone only the picked column shows, unfolded; the strips are for wide screens.
          const shownOnPhone = status === phone;
          return (
            <Fragment key={status}>
              {folded ? (
                <FoldedColumn title={title} count={inColumn.length} onUnfold={toggle} />
              ) : null}
              {!folded || shownOnPhone ? (
                <Column
                  status={status}
                  title={title}
                  tickets={inColumn}
                  view={view}
                  onOpen={onOpen}
                  onFold={toggle}
                  className={`${shownOnPhone ? 'max-sm:w-full' : 'max-sm:hidden'} ${folded ? 'sm:hidden' : ''}`}
                />
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </>
  );
}
