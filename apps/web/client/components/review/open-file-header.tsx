// The open file's sticky header in the review: its path and line counts, Explain file, and Viewed (`v`).

import type { ReactElement } from 'react';

import type { WholeExplain } from './explain-context';
import { useViewed } from './viewed-context';

/** How many lines the file adds and removes. */
export type FileSize = { additions: number; deletions: number };

/** The open file's sticky header: its path and line counts, Explain file, and Viewed (`v`). */
export function FileHeader({
  file,
  whole,
}: {
  file: { path: string; patch: string; additions: number; deletions: number };
  whole: WholeExplain | undefined;
}): ReactElement {
  const viewed = useViewed();
  return (
    <div className="sticky top-0 z-10 -mx-1 flex items-center gap-3 rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
      <h3 className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold" title={file.path}>
        {file.path}
      </h3>
      <span className="shrink-0 font-mono text-xs">
        <span className="text-green-600">+{file.additions}</span>{' '}
        <span className="text-red-600">−{file.deletions}</span>
      </span>
      {whole ? (
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          onClick={() => {
            whole.file(file.patch);
          }}
        >
          Explain file
        </button>
      ) : null}
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <input
          type="checkbox"
          className="size-3.5 accent-indigo-600"
          checked={viewed.isViewed(file)}
          onChange={() => {
            viewed.toggle(file);
          }}
        />
        Viewed
        <kbd className="rounded border border-current px-1 font-mono text-[10px] opacity-60">V</kbd>
      </label>
    </div>
  );
}
