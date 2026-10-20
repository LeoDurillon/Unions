import { useState, type ReactElement, type ReactNode } from 'react';

import { SINCE_REVIEW, slicePosition, type DiffFileSummary } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import { useCommitDiff, useCommitFile } from '../../lib/use-commits';
import { Button, ErrorText } from '../ui';
import { FileDiff, type DiffView } from './file-diff';
import { FileList } from './file-list';

const SHORT_SHA = 7;
const NO_COMMENTS: never[] = [];

/** The file open before, when the commit touches it; else its first file not ignored, else its first. */
function openFile(files: DiffFileSummary[], picked: string | null): DiffFileSummary | null {
  return (
    files.find((file) => file.path === picked) ??
    files.find((file) => !file.ignored) ??
    files[0] ??
    null
  );
}

function CommitFile({
  base,
  sha,
  fileId,
  view,
}: {
  base: string;
  sha: string;
  fileId: number;
  view: DiffView;
}): ReactElement {
  const file = useCommitFile(base, sha, fileId);
  if (!file.data) {
    return <ErrorText error={file.error} />;
  }
  return (
    <div className="space-y-3">
      <h3 className="font-mono text-sm font-semibold">{file.data.path}</h3>
      <FileDiff
        path={file.data.path}
        view={view}
        patch={file.data.patch}
        comments={NO_COMMENTS}
        selection={null}
        onSelect={() => {
          // Read only: comments are written on all the changes.
        }}
        renderBelow={() => null}
      />
    </div>
  );
}

function noticeText(sha: string, reviewed: string | undefined): string {
  const slice = slicePosition(sha);
  if (slice !== null) {
    return slice === 1
      ? 'Slice 1 of the stack: its own change, against the base.'
      : `Slice ${slice} of the stack: its own change, against slice ${slice - 1}.`;
  }
  return sha === SINCE_REVIEW
    ? `The changes since your last review${reviewed ? ` (at ${reviewed.slice(0, SHORT_SHA)})` : ''}.`
    : `Commit ${sha.slice(0, SHORT_SHA)}, against its parent.`;
}

function CommitNotice({
  sha,
  reviewed,
  onAllChanges,
}: {
  sha: string;
  /** For the change since the last review: the head that was reviewed. */
  reviewed: string | undefined;
  onAllChanges: () => void;
}): ReactElement {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      <span>{noticeText(sha, reviewed)} Read only: comments are written on all the changes.</span>
      <Button onClick={onAllChanges}>All changes</Button>
    </div>
  );
}

/**
 * One commit of the change against its first parent (or the change since the last review): its
 * files on the left, the picked one on the right, read only. The open file is kept by path from one
 * commit to the next.
 */
export function CommitDiffBody({
  target,
  base,
  sha,
  view,
  picker,
  banner,
  onAllChanges,
}: {
  target: ReviewTarget;
  base: string;
  sha: string;
  view: DiffView;
  picker: ReactNode;
  banner: ReactNode;
  onAllChanges: () => void;
}): ReactElement {
  const diff = useCommitDiff(base, sha);
  const [picked, setPicked] = useState<string | null>(null);
  const files = diff.data?.files ?? [];
  const file = openFile(files, picked);
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-80 shrink-0 space-y-2 overflow-y-auto border-r border-zinc-200 p-2 dark:border-zinc-800">
        {picker}
        <FileList
          files={files}
          comments={NO_COMMENTS}
          selected={file?.id ?? null}
          onSelect={(id) => {
            setPicked(files.find((candidate) => candidate.id === id)?.path ?? null);
          }}
          target={target}
          allowBySpec={false}
        />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-4">
        {banner}
        <CommitNotice sha={sha} reviewed={diff.data?.sha} onAllChanges={onAllChanges} />
        <ErrorText error={diff.error} />
        {diff.data && files.length === 0 ? (
          <p className="text-sm text-zinc-500">No files changed here.</p>
        ) : null}
        {file ? (
          <CommitFile
            key={`${sha}-${file.id}`}
            base={base}
            sha={sha}
            fileId={file.id}
            view={view}
          />
        ) : null}
      </main>
    </div>
  );
}
