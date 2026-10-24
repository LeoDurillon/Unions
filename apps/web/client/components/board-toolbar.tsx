// Above the board: the search, "Needs you" with its count, where the tickets came from (when some
// came from Notion), how many the filter shows, and how to start one while the backlog has any.
import type { ReactElement } from 'react';

import type { TicketSummary } from '../../src/api-types';
import {
  isFiltering,
  needsYou,
  NO_FILTER,
  type BoardFilter,
  type OriginFilter,
} from '../lib/board-filter';
import { isStartable } from '../lib/labels';
import { Segmented } from './choice';
import { inputClass } from './ui';

const ORIGINS: { value: OriginFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'notion', label: 'From Notion' },
  { value: 'github', label: 'From GitHub' },
];

function NeedsYouToggle({
  on,
  count,
  onChange,
}: {
  on: boolean;
  count: number;
  onChange: (on: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={on}
      title="Steps waiting for your approval, failures, refused commits and red CI checks"
      onClick={() => {
        onChange(!on);
      }}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition ${on ? 'border-amber-400 bg-amber-50 font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200' : 'border-zinc-300 text-zinc-600 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
    >
      Needs you
      <span
        className={`rounded-full px-1.5 font-semibold ${count > 0 ? 'bg-amber-500 text-white' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}
      >
        {count}
      </span>
    </button>
  );
}

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
  if (!tickets.some((ticket) => ticket.originKind === 'notion')) {
    return null;
  }
  return (
    <Segmented
      legend="Where the tickets came from"
      options={ORIGINS}
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
  canStart,
}: {
  /** Every ticket on the board, before the filter. */
  tickets: TicketSummary[];
  /** How many the filter keeps. */
  shown: number;
  filter: BoardFilter;
  onFilter: (filter: BoardFilter) => void;
  /** The cards have Start buttons: while the backlog has a ticket that can start, say how. */
  canStart: boolean;
}): ReactElement {
  const filtering = isFiltering(filter);
  const startable = canStart && tickets.some((ticket) => isStartable(ticket));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-72">
        <input
          type="search"
          aria-label="Search tickets"
          placeholder="Search tickets, #issue or #PR"
          className={`${inputClass} py-1 text-xs`}
          value={filter.text}
          onChange={(event) => {
            onFilter({ ...filter, text: event.target.value });
          }}
        />
      </div>
      <NeedsYouToggle
        on={filter.needsYou}
        count={tickets.filter((ticket) => needsYou(ticket)).length}
        onChange={(on) => {
          onFilter({ ...filter, needsYou: on });
        }}
      />
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
      {startable && !filtering ? (
        <span className="ml-auto text-xs text-zinc-500">
          Start a backlog ticket with its Start button, or drag it into In progress.
        </span>
      ) : null}
    </div>
  );
}
