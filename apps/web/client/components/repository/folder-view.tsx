// A folder of the repository in the Repository tab: its entries in a grid of three columns, folders first. Its
// README follows, in a card of its own.

import type { ReactElement, ReactNode } from 'react';

import type { RepositoryEntry } from '../../../src/repository-api-types';
import { sizeText } from '../../lib/repository/repo-links';
import { nameOf } from '../../lib/repository/repo-tree';
import { EntryIcon } from './entry-icon';

export function FolderGrid({
  entries,
  onPick,
}: {
  entries: RepositoryEntry[];
  onPick: (path: string) => void;
}): ReactElement {
  return (
    <ul className="grid grid-cols-1 overflow-hidden rounded-xl border border-zinc-200 bg-white sm:grid-cols-2 xl:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900">
      {entries.map((entry) => (
        <li key={entry.path} className="border-b border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            title={entry.path}
            onClick={() => {
              onPick(entry.path);
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[12.5px] hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          >
            <EntryIcon type={entry.type} />
            <span className="min-w-0 flex-1 truncate font-mono">
              {nameOf(entry.path)}
              {entry.type === 'dir' ? '/' : ''}
            </span>
            <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
              {entry.size === null ? '' : sizeText(entry.size)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The folder's README, under its name, as a card. */
export function ReadmeCard({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}): ReactElement {
  return (
    <article
      aria-label={name}
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2.5 font-mono text-[12.5px] font-semibold dark:border-zinc-800">
        <EntryIcon type="file" />
        {name}
      </h2>
      {children}
    </article>
  );
}
