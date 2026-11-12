// A file of the repository in the Repository tab, read at the commit. Its text (highlighted, or Markdown rendered),
// its image, or why it is not shown (a submodule, a binary or too large a file).

import type { ReactElement, ReactNode } from 'react';

import type { RepositoryBlob, RepositoryEntry } from '../../../src/repository-api-types';
import type { MarkdownBase } from '../../lib/markdown/markdown-links';
import { SHORT_SHA } from '../../lib/repository/repo-links';
import { nameOf } from '../../lib/repository/repo-tree';
import { readable, useRepositoryBlob } from '../../lib/repository/repository-api';
import { ErrorText } from '../ui/ui';
import { isMarkdown, MarkdownView } from './markdown-view';
import { TextView } from './text-view';

export function Notice({ children }: { children: ReactNode }): ReactElement {
  return <p className="p-4 text-sm text-zinc-500">{children}</p>;
}

type FileProps = { base: MarkdownBase; onPick: (path: string) => void };

export function FileBody({ entry, ...props }: FileProps & { entry: RepositoryEntry }): ReactNode {
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
