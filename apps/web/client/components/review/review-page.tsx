import { useState, type ReactElement } from 'react';

import type { CommentView, DiffResponse } from '../../../src/api-types';
import type { Selection } from '../../lib/diff-selection';
import { useCommentMutations, useComments, useDiff, useDiffFile } from '../../lib/use-review';
import { Button, ErrorText } from '../ui';
import { CommentCard } from './comment-card';
import { CommentEditor } from './comment-editor';
import { FileDiff } from './file-diff';
import { FileList } from './file-list';
import { SendReview } from './send-review';

type Mutations = ReturnType<typeof useCommentMutations>;

function Thread({
  path,
  comments,
  selection,
  side,
  line,
  mutations,
  onDone,
}: {
  path: string;
  comments: CommentView[];
  selection: Selection | null;
  side: 'old' | 'new';
  line: number;
  mutations: Mutations;
  onDone: () => void;
}): ReactElement | null {
  const editing = selection?.side === side && selection.end === line;
  const current = comments.filter((comment) => !comment.outdated);
  if (!editing && current.length === 0) {
    return null;
  }
  return (
    <div className="max-w-3xl space-y-2">
      {current.map((comment) => (
        <CommentCard
          key={comment.id}
          comment={comment}
          onSave={(body) => {
            mutations.edit.mutate({ id: comment.id, body });
          }}
          onDelete={() => {
            mutations.remove.mutate(comment.id);
          }}
        />
      ))}
      {editing ? (
        <CommentEditor
          selection={selection}
          pending={mutations.add.isPending}
          error={mutations.add.error}
          onCancel={onDone}
          onSave={(body) => {
            mutations.add.mutate(
              {
                path,
                side: selection.side,
                startLine: selection.start,
                endLine: selection.end,
                body,
              },
              { onSuccess: onDone },
            );
          }}
        />
      ) : null}
    </div>
  );
}

function OutdatedComments({
  comments,
  mutations,
}: {
  comments: CommentView[];
  mutations: Mutations;
}): ReactElement | null {
  if (comments.length === 0) {
    return null;
  }
  return (
    <details className="rounded-md border border-amber-300 p-2 text-sm dark:border-amber-900">
      <summary className="cursor-pointer">
        {comments.length} comment(s) on an older version of this file
      </summary>
      <div className="mt-2 space-y-2">
        {comments.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            showExcerpt
            onSave={(body) => {
              mutations.edit.mutate({ id: comment.id, body });
            }}
            onDelete={() => {
              mutations.remove.mutate(comment.id);
            }}
          />
        ))}
      </div>
    </details>
  );
}

function OpenFile({
  ticketId,
  fileId,
  comments,
  mutations,
}: {
  ticketId: number;
  fileId: number;
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
        patch={file.data.patch}
        comments={forFile}
        selection={selection}
        onSelect={setSelection}
        renderBelow={(side, line, here) => (
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
        )}
      />
    </div>
  );
}

const SHORT_SHA = 7;

function ReviewHeader({
  title,
  diff,
  drafts,
  mutations,
  onClose,
}: {
  title: string;
  diff: DiffResponse | undefined;
  drafts: number;
  mutations: Mutations;
  onClose: () => void;
}): ReactElement {
  const snapshot = diff?.snapshot;
  const ignoredCount = diff?.files.filter((file) => file.ignored).length ?? 0;
  return (
    <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <Button onClick={onClose}>Back</Button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold">Review: {title}</h2>
        {snapshot ? (
          <p className="text-xs text-zinc-500">
            {diff.files.length} files changed against {snapshot.baseBranch}
            {ignoredCount > 0 ? ` (${ignoredCount} ignored)` : ''} ·{' '}
            {snapshot.headSha.slice(0, SHORT_SHA)}
          </p>
        ) : null}
      </div>
      <SendReview
        drafts={drafts}
        canSend={diff?.canSend ?? false}
        pending={mutations.send.isPending}
        error={mutations.send.error}
        onSend={(summary) => {
          mutations.send.mutate(summary, { onSuccess: onClose });
        }}
      />
    </header>
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
              comments={all}
              mutations={mutations}
            />
          )}
        </main>
      </div>
    </div>
  );
}
