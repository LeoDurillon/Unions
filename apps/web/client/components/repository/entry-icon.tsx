// The small icon of a repository entry, in the tree and in a folder's grid. A folder (open or not), a file, a link
// or a submodule.

import type { ReactElement } from 'react';

import type { RepositoryEntry } from '../../../src/repository-api-types';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function FolderShape({ open }: { open: boolean }): ReactElement {
  return open ? (
    <path d="M3 7.5V6a1.5 1.5 0 0 1 1.5-1.5h4l2 2h7A1.5 1.5 0 0 1 19 8v1M3.4 19.5h15.1l2.5-8.5H6.2L3.4 19.5Z" />
  ) : (
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z" />
  );
}

/** `open`: a folder shown unfolded. */
export function EntryIcon({
  type,
  open = false,
}: {
  type: RepositoryEntry['type'];
  open?: boolean;
}): ReactElement {
  const color =
    type === 'dir' ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500';
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`size-3.5 shrink-0 ${color}`} {...STROKE}>
      {type === 'dir' ? <FolderShape open={open} /> : null}
      {type === 'file' ? (
        <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v4h4" />
      ) : null}
      {type === 'link' ? (
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      ) : null}
      {type === 'submodule' ? (
        <path d="M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7zM4 13h7v7H4z" />
      ) : null}
    </svg>
  );
}
