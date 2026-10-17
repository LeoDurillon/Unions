// The sidebar's Previews entry: how many previews hold containers now, across projects.
import type { ReactElement } from 'react';

import { useRunningPreviews } from '../../lib/use-running-previews';

function PlayIcon(): ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M4 3.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 4 3.5Z" />
    </svg>
  );
}

export function PreviewsButton({
  active,
  onOpen,
}: {
  active: boolean;
  onOpen: () => void;
}): ReactElement {
  const count = useRunningPreviews().data?.length ?? 0;
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-label={count > 0 ? `Previews, ${count} running` : 'Previews'}
      onClick={onOpen}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
        active
          ? 'bg-indigo-100 font-medium text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200'
          : 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
      }`}
    >
      <PlayIcon />
      Previews
      {count > 0 ? (
        <span className="ml-auto rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">
          {count}
        </span>
      ) : null}
    </button>
  );
}
