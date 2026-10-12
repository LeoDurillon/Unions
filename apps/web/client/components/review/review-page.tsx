import { useState, type ReactElement } from 'react';

import type { CommentView, DiffResponse } from '../../../src/api-types';
import type { Selection } from '../../lib/diff-selection';
import { useCommentMutations, useComments, useDiff, useDiffFile } from '../../lib/use-review';
import { ErrorText } from '../ui';
import { hasThread, OutdatedComments, Thread } from './comment-thread';
import { FileDiff, type DiffView } from './file-diff';
import { FileList } from './file-list';
import { ReviewHeader } from './review-header';
import { useDiffView } from './view-toggle';

type Mutations = ReturnType<typeof useCommentMutations>;

function OpenFile({
  ticketId,
  fileId,
  view,
  comments,
  mutations,
}: {
  ticketId: number;
  fileId: number;
  view: DiffView;
  comments: CommentView[];
  mutations: Mutations;
}): ReactElement {
  const file = useDiffFile(ticketId, fileId);
  const [selection, setSelection] = useState<Selection | null>(null);
  if (!file.data) {
    return <ErrorText error={file.error} />;
  }
  const { path } = file.data;
  const forFile = comments.filter((comment) => comment.path === path);
  const outdated = forFile.filter((comment) => comment.outdated);
  return (
    <div className="space-y-3">
      <h3 className="font-mono text-sm font-semibold">{path}</h3>
      <OutdatedComments comments={outdated} mutations={mutations} />
      <FileDiff
        path={path}
        view={view}
        patch={file.data.patch}
        comments={forFile}
        selection={selection}
        onSelect={setSelection}
        renderBelow={(side, line, here) =>
          // Null keeps the diff free of empty rows under lines with nothing to show.
          hasThread(here, selection, side, line) ? (
            <Thread
              path={path}
              comments={here}
              selection={selection}
              side={side}
              line={line}
              mutations={mutations}
              onDone={() => {
                setSelection(null);
              }}
            />
          ) : null
        }
      />
    </div>
  );
}

/** The picked file, else the first file that is not ignored, else the first file. */
function openFileId(files: DiffResponse['files'], picked: number | null): number | null {
  const chosen = files.find((file) => file.id === picked);
  return (chosen ?? files.find((file) => !file.ignored) ?? files[0])?.id ?? null;
}

/** Full-page review: touched files on the left, one file at a time on the right. */
export function ReviewPage({
  ticketId,
  title,
  onClose,
}: {
  ticketId: number;
  title: string;
  onClose: () => void;
}): ReactElement {
  const diff = useDiff(ticketId);
  const comments = useComments(ticketId);
  const mutations = useCommentMutations(ticketId);
  const files = diff.data?.files ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const [view, setView] = useDiffView();
  const fileId = openFileId(files, picked);
  const all = comments.data ?? [];
  const drafts = all.filter((comment) => comment.status === 'draft').length;
  const empty = diff.data !== undefined && diff.data.snapshot === null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <ReviewHeader
        title={title}
        diff={diff.data}
        drafts={drafts}
        view={view}
        onView={setView}
        mutations={mutations}
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-zinc-200 p-2 dark:border-zinc-800">
          <FileList files={files} comments={all} selected={fileId} onSelect={setPicked} />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          <ErrorText error={diff.error ?? comments.error} />
          {empty ? (
            <p className="text-sm text-zinc-500">
              No changes yet: the diff appears after the implementation runs.
            </p>
          ) : null}
          {fileId === null ? null : (
            <OpenFile
              key={fileId}
              ticketId={ticketId}
              fileId={fileId}
              view={view}
              comments={all}
              mutations={mutations}
            />
          )}
        </main>
      </div>
    </div>
  );
}
