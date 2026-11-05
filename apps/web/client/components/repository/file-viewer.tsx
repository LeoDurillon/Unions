// The right side of the Repository tab: the picked file (text highlighted, or its size), or a folder's entries.
import type { ReactElement, ReactNode } from 'react';

import type { RepositoryBlob, RepositoryEntry } from '../../../src/repository-api-types';
import type { MarkdownBase } from '../../lib/markdown-links';
import { SHORT_SHA, sizeText } from '../../lib/repo-links';
import { nameOf, type RepoIndex } from '../../lib/repo-tree';
import { readable, useRepositoryBlob } from '../../lib/repository-api';
import { ErrorText } from '../ui';
import { FileHeader } from './file-header';
import { isMarkdown, MarkdownView } from './markdown-view';
import { TextView } from './text-view';

function Notice({ children }: { children: ReactNode }): ReactElement {
  return <p className="p-4 text-sm text-zinc-500">{children}</p>;
}

function FolderEntries({
  entries,
  onPick,
}: {
  entries: RepositoryEntry[];
  onPick: (path: string) => void;
}): ReactElement {
  return (
    <ul className="divide-y divide-zinc-100 font-mono text-xs dark:divide-zinc-800/60">
      {entries.map((entry) => (
        <li key={entry.path}>
          <button
            type="button"
            onClick={() => {
              onPick(entry.path);
            }}
            className="flex w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
          >
            <span className="min-w-0 flex-1 truncate">
              {nameOf(entry.path)}
              {entry.type === 'dir' ? '/' : ''}
            </span>
            <span className="text-zinc-500 tabular-nums">
              {entry.size === null ? '' : sizeText(entry.size)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type FileProps = { base: MarkdownBase; onPick: (path: string) => void };

function FileBody({ entry, ...props }: FileProps & { entry: RepositoryEntry }): ReactNode {
  const blob = useRepositoryBlob(props.base.projectId, entry);
  if (entry.type === 'submodule') {
    return (
      <Notice>A submodule: another repository, at commit {entry.sha.slice(0, SHORT_SHA)}.</Notice>
    );
  }
  if (!readable(entry)) {
    return <Notice>Too large to show here: open it on GitHub.</Notice>;
  }
  if (blob.error) {
    return <ErrorText error={blob.error} />;
  }
  if (!blob.data) {
    return <Notice>Loading…</Notice>;
  }
  return <BlobBody {...props} blob={blob.data} path={entry.path} />;
}

function BlobBody({
  blob,
  path,
  ...props
}: FileProps & { blob: RepositoryBlob; path: string }): ReactElement {
  if (blob.kind === 'text') {
    return isMarkdown(path) ? (
      <MarkdownView key={path} {...props} text={blob.text} path={path} />
    ) : (
      <TextView text={blob.text} path={path} />
    );
  }
  if (blob.kind === 'image') {
    return (
      <div className="p-4">
        <img src={blob.dataUrl} alt={nameOf(path)} className="max-w-full" />
      </div>
    );
  }
  return (
    <Notice>
      {blob.kind === 'binary' ? 'A binary file' : 'Too large to show here'}: open it on GitHub.
    </Notice>
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
      {folder ? <FolderEntries entries={folder} onPick={onPick} /> : null}
      {!folder && entry ? <FileBody base={base} entry={entry} onPick={onPick} /> : null}
      {!folder && !entry ? <Notice>Nothing at this path in this commit.</Notice> : null}
    </section>
  );
}
