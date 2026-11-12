// The commit the Repository tab shows: its short sha (a link to GitHub), message, author and age, and Refresh.

import type { ReactElement } from 'react';

import type { RepositoryCommit } from '../../../src/repository-api-types';
import { SHORT_SHA } from '../../lib/repository/repo-links';
import { timeAgo } from '../../lib/ui/relative-time';
import { useNow } from '../../lib/ui/use-now';
import { Button } from '../ui/ui';

/** The commit shown, and Refresh to read again where its branch is now. */
export function CommitLine({
  commit,
  onRefresh,
}: {
  commit: RepositoryCommit;
  onRefresh: () => void;
}): ReactElement {
  const now = useNow(false);
  const when = commit.date === null ? null : timeAgo(Date.parse(commit.date), now);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-zinc-500">
      <a
        href={commit.url}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {commit.sha.slice(0, SHORT_SHA)}
      </a>
      <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300" title={commit.message}>
        {commit.message}
      </span>
      <span className="shrink-0">
        {commit.author ?? ''}
        {when ? ` · ${when}` : ''}
      </span>
      <span className="flex-1" />
      <Button onClick={onRefresh}>Refresh</Button>
    </div>
  );
}
