// The pull request's CI checks as one bar, a segment per state (failed, running, passed, skipped), and their counts.

import type { ReactElement } from 'react';

import type { PullRequestCheck } from '../../../src/ci-api-types';

const STATES = [
  { state: 'failed', label: 'failed', bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' },
  {
    state: 'pending',
    label: 'running',
    bar: 'bg-amber-400',
    text: 'text-amber-700 dark:text-amber-400',
  },
  {
    state: 'passed',
    label: 'passed',
    bar: 'bg-green-500',
    text: 'text-green-700 dark:text-green-400',
  },
  {
    state: 'skipped',
    label: 'skipped',
    bar: 'bg-zinc-300 dark:bg-zinc-700',
    text: 'text-zinc-500',
  },
] as const;

const PERCENT = 100;

/** Nothing when the commit has no checks. */
export function CiBar({ checks }: { checks: readonly PullRequestCheck[] }): ReactElement | null {
  if (checks.length === 0) {
    return null;
  }
  const parts = STATES.flatMap((part) => {
    const count = checks.filter((check) => check.state === part.state).length;
    return count > 0 ? [{ count, part }] : [];
  });
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden
        className="flex h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
      >
        {parts.map(({ count, part }) => (
          <span
            key={part.state}
            className={part.bar}
            style={{ width: `${(count / checks.length) * PERCENT}%` }}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs">
        {parts.map(({ count, part }, index) => (
          <span
            key={part.state}
            className={index === 0 ? `font-semibold ${part.text}` : 'text-zinc-500'}
          >
            {index === 0 ? '' : ' · '}
            {count} {part.label}
          </span>
        ))}
      </span>
    </div>
  );
}
