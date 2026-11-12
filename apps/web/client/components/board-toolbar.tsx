// Above the board: the search, where the tickets came from, how many the filter shows, and the
// project at a glance. Where they came from shows when some came from a tracker; the project at a
// glance, on the right, is the Needs you toggle, what runs and Claude's window.
import { useRef, type ReactElement } from 'react';

import type { TicketSummary } from '../../src/api-types';
import { isFiltering, NO_FILTER, originOptions, type BoardFilter } from '../lib/board-filter';
import { useBoardKeys } from '../lib/use-board-keys';
import { BoardSummary } from './board-summary';
import { Segmented } from './choice';
import { inputClass } from './ui';

/** Where the tickets came from: shown only when some came from Notion. */
function OriginPicker({
  tickets,
  filter,
  onFilter,
}: {
  tickets: TicketSummary[];
  filter: BoardFilter;
  onFilter: (filter: BoardFilter) => void;
}): ReactElement | null {
  const options = originOptions(tickets);
  if (options.length === 0) {
    return null;
  }
  return (
    <Segmented
      legend="Where the tickets came from"
      options={options}
      value={filter.origin}
      onChange={(origin) => {
        onFilter({ ...filter, origin });
      }}
    />
  );
}

/** How many tickets the filter keeps, and Clear. */
function FilterCount({
  shown,
  total,
  onClear,
}: {
  shown: number;
  total: number;
  onClear: () => void;
}): ReactElement {
  return (
    <>
      <span className="text-xs text-zinc-500">
        {shown} of {total}
      </span>
      <button
        type="button"
        className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        onClick={onClear}
      >
        Clear
      </button>
    </>
  );
}

export function BoardToolbar({
  tickets,
  shown,
  filter,
  onFilter,
  onOpen,
}: {
  /** Every ticket on the board, before the filter. */
  tickets: TicketSummary[];
  /** How many the filter keeps. */
  shown: number;
  filter: BoardFilter;
  onFilter: (filter: BoardFilter) => void;
  /** Opens a ticket: `n` opens the first that needs the user. */
  onOpen: (id: number) => void;
}): ReactElement {
  const search = useRef<HTMLInputElement>(null);
  useBoardKeys(tickets, search, onOpen);
  const filtering = isFiltering(filter);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-72 max-sm:w-full">
        <input
          ref={search}
          type="search"
          aria-label="Search tickets"
          placeholder="Search tickets, #issue or #PR (/)"
          className={`${inputClass} py-1 text-xs`}
          value={filter.text}
          onChange={(event) => {
            onFilter({ ...filter, text: event.target.value });
          }}
        />
      </div>
      <OriginPicker tickets={tickets} filter={filter} onFilter={onFilter} />
      {filtering ? (
        <FilterCount
          shown={shown}
          total={tickets.length}
          onClear={() => {
            onFilter(NO_FILTER);
          }}
        />
      ) : null}
      <BoardSummary
        tickets={tickets}
        needsYouOn={filter.needsYou}
        onNeedsYou={(on) => {
          onFilter({ ...filter, needsYou: on });
        }}
      />
    </div>
  );
}
