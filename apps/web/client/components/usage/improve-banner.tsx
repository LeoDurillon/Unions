// The Usage tab's banner leading to What to improve: how many ways to spend less were found, and the first.

import type { ProjectFindings } from '@union/core';
import type { ReactElement } from 'react';

import { FINDING_TEXTS } from '../../lib/usage/finding-text';

/** Nothing when nothing stands out. */
export function ImproveBanner({
  findings,
  onOpen,
}: {
  findings: ProjectFindings | undefined;
  onOpen: () => void;
}): ReactElement | null {
  const list = findings?.findings ?? [];
  const [first] = list;
  if (!first) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-300 dark:border-amber-900 dark:bg-amber-950/40"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-sm font-bold text-amber-700 dark:bg-zinc-900 dark:text-amber-300">
        {list.length}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <strong className="font-semibold">
          {list.length === 1 ? 'One way' : `${list.length} ways`} to spend less
        </strong>{' '}
        <span className="text-zinc-600 dark:text-zinc-400">
          · {FINDING_TEXTS[first.kind].title}
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-semibold text-amber-700 dark:text-amber-300">
        See what to improve →
      </span>
    </button>
  );
}
