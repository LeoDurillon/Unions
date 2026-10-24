// The sidebar's Previews entry: how many previews hold containers now, across projects.
import type { ReactElement } from 'react';

import { useRunningPreviews } from '../../lib/use-running-previews';
import { SIDE_BADGE, SIDE_ITEM, SIDE_LABEL } from '../sidebar-classes';

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
      title="Previews"
      className={`${SIDE_ITEM} ${
        active
          ? 'bg-indigo-100 font-medium text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200'
          : 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
      }`}
    >
      <PlayIcon />
      <span className={SIDE_LABEL}>Previews</span>
      {count > 0 ? <span className={`${SIDE_BADGE} bg-emerald-600`}>{count}</span> : null}
    </button>
  );
}
