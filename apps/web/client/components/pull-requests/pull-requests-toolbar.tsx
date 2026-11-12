// Above the Pull requests tab's list: Open, Closed or All, a search, and the two filters. Then how many are
// shown, how old the list GitHub gave is, and Refresh.
import type { ReactElement } from 'react';

import {
  PULL_REQUEST_FILTERS,
  type PullRequestFilter,
  type PullRequestList,
} from '../../../src/api-types';
import type { PullFilter } from '../../lib/pull-request/pull-request-filter';
import { formatWhen } from '../../lib/ui/relative-time';
import { Segmented } from '../ui/choice';
import { Button, inputClass } from '../ui/ui';

const FILTER_LABELS: Record<PullRequestFilter, string> = {
  open: 'Open',
  closed: 'Closed',
  all: 'All',
};
const MS_PER_MINUTE = 60_000;

/** `just now`, `3 min ago`: how old the list GitHub gave is. */
function age(fetchedAt: number, now: number): string {
  const minutes = Math.floor((now - fetchedAt) / MS_PER_MINUTE);
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

/** A filter that is on or off, as a pill. */
function Chip({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        onChange(!on);
      }}
      className={`h-7.5 rounded-full border px-3 text-xs whitespace-nowrap transition ${on ? 'border-indigo-300 bg-indigo-50 font-medium text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200' : 'border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
    >
      {label}
    </button>
  );
}

/** The search and the two filters, over the list GitHub gave. */
function Filters({
  filter,
  onFilter,
}: {
  filter: PullFilter;
  onFilter: (filter: PullFilter) => void;
}): ReactElement {
  return (
    <>
      <div className="w-72 max-sm:w-full">
        <input
          type="search"
          aria-label="Find a pull request"
          placeholder="Find by title, #number or branch"
          className={`${inputClass} py-1 text-xs`}
          value={filter.text}
          onChange={(event) => {
            onFilter({ ...filter, text: event.target.value });
          }}
        />
      </div>
      <Chip
        on={filter.withTicket}
        label="With a ticket"
        onChange={(withTicket) => {
          onFilter({ ...filter, withTicket });
        }}
      />
      <Chip
        on={filter.hideDrafts}
        label="Drafts hidden"
        onChange={(hideDrafts) => {
          onFilter({ ...filter, hideDrafts });
        }}
      />
    </>
  );
}

/** "16 open", "16 open, newest 100 shown", "4 of 16" while filtering. */
function countText(list: PullRequestList, state: PullRequestFilter, kept: number): string {
  const shown = list.pullRequests.length;
  const listed = `${list.total} ${state === 'all' ? 'in all' : state}`;
  if (kept < shown) {
    return `${kept} of ${listed}`;
  }
  return list.total > shown ? `${listed}, newest ${shown} shown` : listed;
}

export function PullRequestsToolbar({
  state,
  onState,
  filter,
  onFilter,
  list,
  kept,
  receivedAt,
  fetching,
  onRefresh,
}: {
  state: PullRequestFilter;
  onState: (state: PullRequestFilter) => void;
  filter: PullFilter;
  onFilter: (filter: PullFilter) => void;
  list: PullRequestList | undefined;
  /** How many the search and the filters keep. */
  kept: number;
  /** When the page got the list: its age is told as of then (the server may have kept it a while). */
  receivedAt: number;
  fetching: boolean;
  onRefresh: () => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-6 pt-4">
      <Segmented
        legend="Pull requests to show"
        options={PULL_REQUEST_FILTERS.map((value) => ({ value, label: FILTER_LABELS[value] }))}
        value={state}
        onChange={onState}
      />
      <Filters filter={filter} onFilter={onFilter} />
      <span className="text-xs text-zinc-500">{list ? countText(list, state, kept) : ''}</span>
      <span className="flex-1" />
      {list ? (
        <span className="text-xs text-zinc-500" title={formatWhen(list.fetchedAt)}>
          Read from GitHub {age(list.fetchedAt, receivedAt)}
        </span>
      ) : null}
      {list || !fetching ? null : (
        <span className="text-xs text-zinc-500">Reading the pull requests from GitHub…</span>
      )}
      <Button
        disabled={fetching}
        aria-busy={fetching}
        className="flex items-center gap-2"
        title="Ask GitHub again now, instead of the list read a few minutes ago"
        onClick={onRefresh}
      >
        {fetching ? (
          <span
            aria-hidden
            className="size-3 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600 dark:border-zinc-700 dark:border-t-indigo-400"
          />
        ) : null}
        Refresh
      </Button>
    </div>
  );
}
