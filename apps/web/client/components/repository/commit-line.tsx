// The commit the Repository tab shows: its author, message, short sha (a link to GitHub) and age, and Refresh.

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
    <div className="flex min-w-0 flex-1 items-center gap-2.5 text-xs text-zinc-500">
      {commit.author ? (
        <span className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-bold text-zinc-700 uppercase dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {commit.author.slice(0, 2)}
          </span>
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{commit.author}</span>
        </span>
      ) : null}
      <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-400" title={commit.message}>
        {commit.message}
      </span>
      <a
        href={commit.url}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 font-mono text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {commit.sha.slice(0, SHORT_SHA)}
      </a>
      {when ? <span className="shrink-0">{when}</span> : null}
      <span className="flex-1" />
      <Button onClick={onRefresh}>Refresh</Button>
    </div>
  );
}
