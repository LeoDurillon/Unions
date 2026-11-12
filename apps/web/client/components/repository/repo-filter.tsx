// The Repository tab's "go to file": a box that finds files by a few letters of their path, and the files found.

import { useMemo, useRef, type ReactElement } from 'react';

import type { RepositoryEntry } from '../../../src/repository-api-types';
import { useUrlParam } from '../../lib/app/url-state';
import { nameOf, parentOf } from '../../lib/repository/repo-tree';
import { FILTER_LIMIT, filterPaths } from '../../lib/review/path-filter';
import { useShortcuts } from '../../lib/ui/shortcuts';
import { inputClass } from '../ui/ui';

/** The filter box; `/` focuses it while no ticket is open over the tab. */
export function RepoFilterBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const covered = useUrlParam('ticket') !== null;
  useShortcuts({ '/': covered ? undefined : () => input.current?.focus() });
  return (
    <input
      ref={input}
      type="search"
      value={value}
      placeholder="Go to file (/)"
      aria-label="Go to file"
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onChange('');
        }
      }}
      className={`${inputClass} w-full`}
    />
  );
}

/** The files whose path holds the letters in order, best first. */
export function RepoFilterResults({
  entries,
  query,
  partial,
  onPick,
}: {
  entries: Map<string, RepositoryEntry>;
  query: string;
  /** The tree was truncated: only the folders opened so far are searched. */
  partial: boolean;
  onPick: (path: string) => void;
}): ReactElement {
  const found = useMemo(() => {
    const files = [...entries.values()].filter((entry) => entry.type !== 'dir');
    return filterPaths(
      files.map((entry) => entry.path),
      query,
    );
  }, [entries, query]);
  return (
    <div className="space-y-1">
      {partial ? (
        <p className="px-2 text-xs text-zinc-500">
          A large repository: only the folders opened so far are searched.
        </p>
      ) : null}
      {found.length === 0 ? <p className="px-2 text-xs text-zinc-500">No file matches.</p> : null}
      <ul className="space-y-0.5">
        {found.map((path) => (
          <li key={path}>
            <button
              type="button"
              title={path}
              onClick={() => {
                onPick(path);
              }}
              className="flex w-full min-w-0 flex-col rounded-md px-2 py-1 text-left font-mono text-xs hover:bg-zinc-200/70 dark:hover:bg-zinc-800"
            >
              <span className="truncate">{nameOf(path)}</span>
              <span className="truncate text-xs text-zinc-500">{parentOf(path) || '/'}</span>
            </button>
          </li>
        ))}
      </ul>
      {found.length === FILTER_LIMIT ? (
        <p className="px-2 text-xs text-zinc-500">
          The first {FILTER_LIMIT}: type more to narrow it.
        </p>
      ) : null}
    </div>
  );
}
