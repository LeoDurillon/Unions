// The pull requests under review without a ticket, then every pull request of the project's
// repository, read from GitHub, open stacks as one row; linked ones open their ticket.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import {
  PULL_REQUEST_FILTERS,
  type PublicProject,
  type PullRequestFilter,
  type PullRequestList,
} from '../../../src/api-types';
import { api } from '../../lib/api';
import { Button, ErrorText } from '../ui';
import { PullRequestRows } from './pull-request-rows';
import { UnderReview } from './under-review';

const FILTER_LABELS: Record<PullRequestFilter, string> = {
  open: 'Open',
  closed: 'Closed',
  all: 'All',
};
/** The page asks the server again after this long; the server itself keeps GitHub's list a few minutes. */
const STALE_MS = 300_000;
/** Lists of the other filters and projects are kept this long after leaving them. */
const KEEP_MS = 1_800_000;
const MS_PER_MINUTE = 60_000;

/** `just now`, `3 min ago`: how old the list GitHub gave is. */
function age(fetchedAt: number, now: number): string {
  const minutes = Math.floor((now - fetchedAt) / MS_PER_MINUTE);
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

function FilterToggle({
  filter,
  onChange,
}: {
  filter: PullRequestFilter;
  onChange: (filter: PullRequestFilter) => void;
}): ReactElement {
  return (
    <fieldset className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
      <legend className="sr-only">Pull requests to show</legend>
      {PULL_REQUEST_FILTERS.map((entry) => (
        <button
          key={entry}
          type="button"
          aria-pressed={entry === filter}
          onClick={() => {
            onChange(entry);
          }}
          className={`rounded px-2.5 py-1 text-xs transition ${entry === filter ? 'bg-indigo-100 font-medium dark:bg-indigo-950' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
        >
          {FILTER_LABELS[entry]}
        </button>
      ))}
    </fieldset>
  );
}

/** The filter, how many there are, and Refresh. */
function Toolbar({
  filter,
  onFilter,
  list,
  receivedAt,
  fetching,
  onRefresh,
}: {
  filter: PullRequestFilter;
  onFilter: (filter: PullRequestFilter) => void;
  list: PullRequestList | undefined;
  /** When the page got the list: its age is told as of then (the server may have kept it a while). */
  receivedAt: number;
  fetching: boolean;
  onRefresh: () => void;
}): ReactElement {
  const shown = list?.pullRequests.length ?? 0;
  return (
    <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
      <FilterToggle filter={filter} onChange={onFilter} />
      <span className="text-xs text-zinc-500">
        {list
          ? `${list.total} ${filter === 'all' ? 'in all' : filter}${list.total > shown ? `, newest ${shown} shown` : ''}`
          : ''}
      </span>
      <div className="flex-1" />
      {list ? (
        <span className="text-xs text-zinc-500" title={new Date(list.fetchedAt).toLocaleString()}>
          Read from GitHub {age(list.fetchedAt, receivedAt)}
        </span>
      ) : null}
      <Button
        disabled={fetching}
        title="Ask GitHub again now, instead of the list read a few minutes ago"
        onClick={onRefresh}
      >
        {fetching ? 'Loading…' : 'Refresh'}
      </Button>
    </div>
  );
}

const LOADING_ROWS = 6;

/** Grey rows while GitHub is read the first time. */
function LoadingRows(): ReactElement {
  return (
    <ul aria-label="Loading pull requests" className="mt-3 animate-pulse">
      {Array.from({ length: LOADING_ROWS }, (_, index) => (
        <li
          key={index}
          className="flex items-center gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800"
        >
          <span className="h-4 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <span className="h-4 flex-1 rounded bg-zinc-200 dark:bg-zinc-800" />
          <span className="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
        </li>
      ))}
    </ul>
  );
}

/** The list, as the server keeps it, and Refresh: GitHub read again now, put in its place. */
function usePullRequestList(
  projectId: number,
  filter: PullRequestFilter,
): {
  query: ReturnType<typeof useQuery<PullRequestList>>;
  refresh: ReturnType<typeof useMutation<PullRequestList, Error, void>>;
} {
  const queryClient = useQueryClient();
  const queryKey = ['pull-requests', projectId, filter];
  const query = useQuery({
    queryKey,
    queryFn: () => api.pullRequests(projectId, filter),
    staleTime: STALE_MS,
    gcTime: KEEP_MS,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: () => api.pullRequests(projectId, filter, true),
    onSuccess: (fresh) => {
      queryClient.setQueryData(queryKey, fresh);
    },
  });
  return { query, refresh };
}

/** Every pull request of the project's repository, read from GitHub, open stacks as one row; linked ones open their ticket. */
export function PullRequestsPage({
  project,
  onOpenTicket,
}: {
  project: PublicProject;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const [filter, setFilter] = useState<PullRequestFilter>('open');
  const { query, refresh } = usePullRequestList(project.id, filter);
  const list = query.data;
  const shown = list?.pullRequests.length ?? 0;
  return (
    <div className="flex h-full flex-col">
      <Toolbar
        filter={filter}
        onFilter={setFilter}
        list={list}
        receivedAt={query.dataUpdatedAt}
        fetching={query.isFetching || refresh.isPending}
        onRefresh={() => {
          refresh.mutate();
        }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-3">
          <ErrorText error={query.error ?? refresh.error} />
        </div>
        <UnderReview project={project} />
        {!list && query.isFetching ? <LoadingRows /> : null}
        {list && shown === 0 ? (
          <p className="px-4 text-sm text-zinc-500">No pull requests.</p>
        ) : null}
        {list ? (
          <PullRequestRows
            projectId={project.id}
            pulls={list.pullRequests}
            stacks={list.stacks}
            open={filter === 'open'}
            onOpenTicket={onOpenTicket}
          />
        ) : null}
      </div>
    </div>
  );
}
