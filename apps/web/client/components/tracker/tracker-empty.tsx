// A tracker tab with no comments (Notion page, Jira issue): a check mark, a title and what would show here.

import type { ReactElement, ReactNode } from 'react';

export function TrackerEmpty({
  title,
  children,
}: {
  title: string;
  /** What would show here, and what can be done with it. */
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
      >
        ✓
      </span>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <p className="max-w-sm text-xs text-zinc-500">{children}</p>
    </div>
  );
}
