import { useState, type ReactElement, type ReactNode } from 'react';

import type { CommentView, DiffResponse } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import type { useCommentMutations } from '../../lib/use-review';
import { ErrorText } from '../ui';
import type { DiffView } from './file-diff';
import { FileList } from './file-list';
import { GeneralComments } from './general-comments';
import { OpenFile } from './open-file';

type Mutations = ReturnType<typeof useCommentMutations>;

/** The picked file, else the first file that is not ignored, else the first file. */
function openFileId(files: DiffResponse['files'], picked: number | null): number | null {
  const chosen = files.find((file) => file.id === picked);
  return (chosen ?? files.find((file) => !file.ignored) ?? files[0])?.id ?? null;
}

/** The touched files on the left, the picked one on the right. */
export function DiffBody({
  target,
  files,
  comments,
  view,
  mutations,
  banner,
  error,
  emptyText,
  picker,
}: {
  target: ReviewTarget;
  files: DiffResponse['files'];
  comments: CommentView[];
  view: DiffView;
  mutations: Mutations;
  banner: ReactNode;
  error: Error | null;
  emptyText: string | null;
  /** A pull request's commit picker, above the files. */
  picker: ReactNode;
}): ReactElement {
  const [picked, setPicked] = useState<{ id: number; part: string | null } | null>(null);
  const fileId = openFileId(files, picked?.id ?? null);
  const part = picked?.id === fileId ? picked.part : null;
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-80 shrink-0 space-y-2 overflow-y-auto border-r border-zinc-200 p-2 dark:border-zinc-800">
        {picker}
        <FileList
          files={files}
          comments={comments}
          selected={fileId}
          onSelect={(id, under) => {
            setPicked({ id, part: under });
          }}
          part={part}
          target={target}
        />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-4">
        {banner}
        <ErrorText error={error} />
        {emptyText ? <p className="text-sm text-zinc-500">{emptyText}</p> : null}
        <GeneralComments comments={comments} mutations={mutations} />
        {fileId === null ? null : (
          <OpenFile
            key={`${fileId}-${part ?? ''}`}
            target={target}
            fileId={fileId}
            view={view}
            comments={comments}
            mutations={mutations}
            part={part}
          />
        )}
      </main>
    </div>
  );
}
