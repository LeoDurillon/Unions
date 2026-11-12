// The right side of the Repository tab: the picked file (text highlighted, or its size), or a folder. A folder
// shows its entries, then its README.

import type { ReactElement } from 'react';

import type { RepositoryEntry } from '../../../src/repository-api-types';
import type { MarkdownBase } from '../../lib/markdown/markdown-links';
import { readmeOf } from '../../lib/repository/readme';
import { nameOf, type RepoIndex } from '../../lib/repository/repo-tree';
import { FileBody, Notice } from './file-body';
import { FileHeader } from './file-header';
import { FolderGrid, ReadmeCard } from './folder-view';

/** A folder: its entries, then its README. */
function FolderPart({
  base,
  entries,
  onPick,
}: {
  base: MarkdownBase;
  entries: RepositoryEntry[];
  onPick: (path: string) => void;
}): ReactElement {
  const readme = readmeOf(entries);
  return (
    <div className="space-y-4 p-5">
      <FolderGrid entries={entries} onPick={onPick} />
      {readme ? (
        <ReadmeCard name={nameOf(readme.path)}>
          <FileBody base={base} entry={readme} onPick={onPick} />
        </ReadmeCard>
      ) : null}
    </div>
  );
}

/** The picked file or folder (the root when nothing is picked). */
export function FileViewer({
  base,
  path,
  entry,
  index,
  onPick,
}: {
  base: MarkdownBase;
  path: string;
  /** Undefined when nothing at the commit has that path. */
  entry: RepositoryEntry | undefined;
  index: RepoIndex;
  onPick: (path: string) => void;
}): ReactElement {
  const folder = path === '' || entry?.type === 'dir' ? (index.get(path) ?? []) : null;
  return (
    <section aria-label={path === '' ? 'Repository root' : path} className="min-w-0">
      <FileHeader place={base.place} path={path} entry={entry} onPick={onPick} />
      {folder ? <FolderPart base={base} entries={folder} onPick={onPick} /> : null}
      {!folder && entry ? (
        <div className="bg-white dark:bg-zinc-900">
          <FileBody base={base} entry={entry} onPick={onPick} />
        </div>
      ) : null}
      {!folder && !entry ? <Notice>Nothing at this path in this commit.</Notice> : null}
    </section>
  );
}
