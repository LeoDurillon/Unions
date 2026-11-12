// The open file's or folder's path, each folder of it a link up, with its size and the way to it on GitHub.

import type { ReactElement } from 'react';

import type { RepositoryEntry } from '../../../src/repository-api-types';
import { githubUrl, sizeText, type GitHubPlace } from '../../lib/repository/repo-links';

function Crumbs({
  root,
  path,
  onPick,
}: {
  root: string;
  path: string;
  onPick: (path: string) => void;
}): ReactElement {
  const parts = path === '' ? [] : path.split('/');
  const crumbs = parts.map((name, index) => ({ name, at: parts.slice(0, index + 1).join('/') }));
  return (
    <nav
      aria-label="Path"
      className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-[13px]"
    >
      <button
        type="button"
        onClick={() => {
          onPick('');
        }}
        className="text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {root}
      </button>
      {crumbs.map((crumb, index) => (
        <span key={crumb.at} className="flex items-center gap-1">
          <span className="text-zinc-500">/</span>
          {index === crumbs.length - 1 ? (
            <span className="font-medium">{crumb.name}</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                onPick(crumb.at);
              }}
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {crumb.name}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}

/** The path as links up, the file's size, and Open on GitHub. */
export function FileHeader({
  place,
  path,
  entry,
  onPick,
}: {
  place: GitHubPlace;
  path: string;
  entry: RepositoryEntry | undefined;
  onPick: (path: string) => void;
}): ReactElement {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-white/95 px-5 py-2.5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <Crumbs root={place.repo} path={path} onPick={onPick} />
      <span className="flex-1" />
      {entry?.size === null || entry?.size === undefined ? null : (
        <span className="text-xs text-zinc-500 tabular-nums">{sizeText(entry.size)}</span>
      )}
      <a
        href={githubUrl(place, path, entry)}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
      >
        Open on GitHub ↗
      </a>
    </header>
  );
}
