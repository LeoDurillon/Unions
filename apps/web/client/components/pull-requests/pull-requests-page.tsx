// The Pull requests tab: the pull requests under review, then every pull request of the repository. They are
// read from GitHub, open stacks as one row, narrowed by a search and filters; linked ones open their ticket.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { PublicProject, PullRequestFilter, PullRequestList } from '../../../src/api-types';
import { api } from '../../lib/app/api';
import { filterPulls, NO_PULL_FILTER } from '../../lib/pull-request/pull-request-filter';
import { ErrorText } from '../ui/ui';
import { PullRequestRows } from './pull-request-rows';
import { PullRequestsToolbar } from './pull-requests-toolbar';
import { UnderReview } from './under-review';

/** The page asks the server again after this long; the server itself keeps GitHub's list a few minutes. */
const STALE_MS = 300_000;
/** Lists of the other filters and projects are kept this long after leaving them. */
const KEEP_MS = 1_800_000;

const LOADING_ROWS = 6;

/** Grey rows while GitHub is read the first time. */
function LoadingRows(): ReactElement {
  return (
    <ul
      aria-label="Loading pull requests"
      className="mx-6 mt-5 animate-pulse divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {Array.from({ length: LOADING_ROWS }, (_, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-4">
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
  // A read from GitHub removes the reviews of closed and merged pull requests.
  const reviewsRead = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['current-reviews', projectId] });
  };
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const fresh = await api.pullRequests(projectId, filter);
      reviewsRead();
      return fresh;
    },
    staleTime: STALE_MS,
    gcTime: KEEP_MS,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: () => api.pullRequests(projectId, filter, true),
    onSuccess: (fresh) => {
      queryClient.setQueryData(queryKey, fresh);
      reviewsRead();
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
  const [state, setState] = useState<PullRequestFilter>('open');
  const [filter, setFilter] = useState(NO_PULL_FILTER);
  const { query, refresh } = usePullRequestList(project.id, state);
  const list = query.data;
  const kept = list ? filterPulls(list.pullRequests, filter) : [];
  return (
    <div className="flex h-full flex-col">
      <PullRequestsToolbar
        state={state}
        onState={setState}
        filter={filter}
        onFilter={setFilter}
        list={list}
        kept={kept.length}
        receivedAt={query.dataUpdatedAt}
        fetching={query.isFetching || refresh.isPending}
        onRefresh={() => {
          refresh.mutate();
        }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-6 pt-3">
          <ErrorText error={query.error ?? refresh.error} />
        </div>
        <UnderReview project={project} />
        {!list && query.isFetching ? <LoadingRows /> : null}
        {list && kept.length === 0 ? (
          <p className="px-6 pt-5 text-sm text-zinc-500">
            {list.pullRequests.length === 0 ? 'No pull requests.' : 'None matches.'}
          </p>
        ) : null}
        {list ? (
          <PullRequestRows
            projectId={project.id}
            pulls={kept}
            stacks={list.stacks}
            open={state === 'open'}
            onOpenTicket={onOpenTicket}
          />
        ) : null}
      </div>
    </div>
  );
}
