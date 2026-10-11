import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import type { RepoOption } from '../../../src/api-types';
import { api } from '../../lib/api';
import { Badge, Button, ErrorText, inputClass } from '../ui';
import type { StepProps } from './draft';

function RepoCard({
  repo,
  selected,
  onSelect,
}: {
  repo: RepoOption;
  selected: boolean;
  onSelect: (repo: RepoOption) => void;
}): ReactElement {
  const border = selected
    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
    : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800';
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(repo);
      }}
      className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${border}`}
    >
      <span>
        <span className="block text-sm font-medium">{repo.fullName}</span>
        <span className="text-xs text-zinc-500">default branch: {repo.defaultBranch}</span>
      </span>
      {repo.isPrivate ? <Badge tone="neutral">private</Badge> : null}
    </button>
  );
}

export function RepositoryStep({ draft, patch }: StepProps): ReactElement {
  const [filter, setFilter] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['gh-repos', draft.token],
    queryFn: ({ pageParam }) => api.github.repos(draft.token, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasNext ? pages.length + 1 : undefined),
  });
  const repos = (query.data?.pages ?? []).flatMap((page) => page.repos);
  const shown = repos.filter((repo) => repo.fullName.toLowerCase().includes(filter.toLowerCase()));

  const select = (repo: RepoOption): void => {
    patch({ repo, baseBranch: repo.defaultBranch, project: null });
  };

  return (
    <div className="space-y-3">
      <input
        className={inputClass}
        placeholder="Filter repositories…"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
        }}
      />
      <ErrorText error={query.error} />
      {query.isPending ? <p className="text-sm text-zinc-500">Loading repositories…</p> : null}
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {shown.map((repo) => (
          <RepoCard
            key={repo.id}
            repo={repo}
            selected={draft.repo?.id === repo.id}
            onSelect={select}
          />
        ))}
        {query.hasNextPage ? (
          <Button
            disabled={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
