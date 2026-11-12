// The repository's folders and files; a folder unfolds on click, its entries drawn only once open.

import type { ReactElement } from 'react';

import type { RepositoryEntry } from '../../../src/repository-api-types';
import { nameOf } from '../../lib/repository/repo-tree';
import { INDENT, PADDING } from '../review/file-row';
import type { RepoTreeState } from './use-repo-tree';

const ROW =
  'flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left font-mono text-xs transition';

const MARKS: Record<RepositoryEntry['type'], string> = {
  dir: '',
  file: '',
  link: '↪',
  submodule: '⧉',
};

function markOf(entry: RepositoryEntry, open: boolean): string {
  if (entry.type !== 'dir') {
    return MARKS[entry.type];
  }
  return open ? '▾' : '▸';
}

function EntryRow({
  entry,
  depth,
  state,
  selected,
  onPick,
}: {
  entry: RepositoryEntry;
  depth: number;
  state: RepoTreeState;
  selected: string | null;
  onPick: (path: string) => void;
}): ReactElement {
  const isDir = entry.type === 'dir';
  const open = state.open.has(entry.path);
  const active = entry.path === selected;
  return (
    <button
      type="button"
      title={entry.path}
      aria-expanded={isDir ? open : undefined}
      aria-current={active ? 'true' : undefined}
      onClick={() => {
        if (isDir) {
          state.toggle(entry);
        }
        onPick(entry.path);
      }}
      style={{ paddingLeft: PADDING + depth * INDENT }}
      className={`${ROW} ${active ? 'bg-indigo-100 text-zinc-900 dark:bg-indigo-950 dark:text-zinc-100' : 'text-zinc-700 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800'}`}
    >
      <span aria-hidden className="w-3 shrink-0 text-center text-[10px] text-zinc-500">
        {markOf(entry, open)}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${isDir ? 'text-zinc-600 dark:text-zinc-400' : ''}`}
      >
        {nameOf(entry.path)}
        {isDir ? '/' : ''}
      </span>
      {state.loading.has(entry.path) ? <span className="text-[10px] text-zinc-500">…</span> : null}
    </button>
  );
}

function Folder({
  path,
  depth,
  ...props
}: {
  path: string;
  depth: number;
  state: RepoTreeState;
  selected: string | null;
  onPick: (path: string) => void;
}): ReactElement | null {
  const entries = props.state.index.get(path);
  if (!entries) {
    return null;
  }
  return (
    <ul className="space-y-0.5">
      {entries.map((entry) => (
        <li key={entry.path}>
          <EntryRow {...props} entry={entry} depth={depth} />
          {entry.type === 'dir' && props.state.open.has(entry.path) ? (
            <Folder {...props} path={entry.path} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** The repository's folders and files from the root; a folder unfolds on click. */
export function RepoTreeView(props: {
  state: RepoTreeState;
  selected: string | null;
  onPick: (path: string) => void;
}): ReactElement {
  return (
    <nav aria-label="Repository files">
      <Folder {...props} path="" depth={0} />
    </nav>
  );
}
