// On a phone, where one board column shows at a time: a button per column with its count, to switch between them.

import type { BoardColumn } from '@union/core';
import type { ReactElement } from 'react';

import type { TicketSummary } from '../../../src/api-types';
import { COLUMNS } from '../../lib/board/labels';

export function ColumnSwitcher({
  tickets,
  current,
  onPick,
}: {
  tickets: TicketSummary[];
  current: BoardColumn;
  onPick: (status: BoardColumn) => void;
}): ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Columns"
      className="flex shrink-0 gap-1.5 overflow-x-auto sm:hidden"
    >
      {COLUMNS.map(({ status, title }) => {
        const on = status === current;
        const count = tickets.filter((ticket) => ticket.board === status).length;
        return (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => {
              onPick(status);
            }}
            className={`h-9 shrink-0 rounded-full px-3 text-[12.5px] whitespace-nowrap ${on ? 'bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'}`}
          >
            {title} <span className="opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
