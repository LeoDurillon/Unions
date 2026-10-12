import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import {
  PULL_REQUEST_FILTERS,
  type PublicProject,
  type PullRequestFilter,
  type PullRequestList,
} from '../../../src/api-types';
import { api } from '../../lib/api';
import { useCurrentReviewMutations, useCurrentReviews } from '../../lib/use-current-reviews';
import { Button, ErrorText } from '../ui';
import { PullRequestItem } from './pull-request-item';

const FILTER_LABELS: Record<PullRequestFilter, string> = {
  open: 'Open',
  closed: 'Closed',
  all: 'All',
};
/** GitHub is only asked again after this long, or on Refresh. */
const STALE_MS = 60_000;

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
  fetching,
  onRefresh,
}: {
  filter: PullRequestFilter;
  onFilter: (filter: PullRequestFilter) => void;
  list: PullRequestList | undefined;
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
      <Button disabled={fetching} onClick={onRefresh}>
        {fetching ? 'Loading…' : 'Refresh'}
      </Button>
    </div>
  );
}

/** Every pull request of the project's repository, read from GitHub; linked ones open their ticket. */
export function PullRequestsPage({
  project,
  onOpenTicket,
}: {
  project: PublicProject;
  onOpenTicket: (id: number) => void;
}): ReactElement {
  const [filter, setFilter] = useState<PullRequestFilter>('open');
  const query = useQuery({
    queryKey: ['pull-requests', project.id, filter],
    queryFn: () => api.pullRequests(project.id, filter),
    staleTime: STALE_MS,
    retry: false,
  });
  const reviews = useCurrentReviews(project.id);
  const { add } = useCurrentReviewMutations(project.id);
  const inReview = new Set(reviews.data?.map((review) => review.prNumber));
  const list = query.data;
  const shown = list?.pullRequests.length ?? 0;
  return (
    <div className="flex h-full flex-col">
      <Toolbar
        filter={filter}
        onFilter={setFilter}
        list={list}
        fetching={query.isFetching}
        onRefresh={() => {
          void query.refetch();
        }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-3">
          <ErrorText error={query.error ?? add.error} />
        </div>
        {list && shown === 0 ? (
          <p className="px-4 text-sm text-zinc-500">No pull requests.</p>
        ) : null}
        <ul>
          {list?.pullRequests.map((pull) => (
            <PullRequestItem
              key={pull.number}
              pull={pull}
              inReview={inReview.has(pull.number)}
              onOpenTicket={onOpenTicket}
              onAddReview={() => {
                add.mutate(pull);
              }}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
