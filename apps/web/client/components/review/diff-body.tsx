// The touched files on the left, the picked one on the right.
import { useState, type ReactElement, type ReactNode } from 'react';

import type { CommentView, DiffResponse } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import type { useCommentMutations } from '../../lib/use-review';
import { ErrorText } from '../ui';
import { useExplain, type ExplainFocus } from './explain-context';
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

type Picked = { id: number; part: string | null; seq: number };

/** An explanation's focus the user has not moved away from yet. */
function freshFocus(picked: Picked | null, shown: ExplainFocus | null): ExplainFocus | null {
  return shown !== null && shown.seq > (picked?.seq ?? 0) ? shown : null;
}

/**
 * The open file: the one an explanation opened (whole) until the user picks another, else the
 * picked one. `fresh` is that explanation's focus, for the file to select its lines.
 */
function openFile(
  files: DiffResponse['files'],
  picked: Picked | null,
  shown: ExplainFocus | null,
): { fileId: number | null; part: string | null; fresh: ExplainFocus | null } {
  const fresh = freshFocus(picked, shown);
  const focused = fresh ? files.find((file) => file.path === fresh.path) : undefined;
  const fileId = openFileId(files, focused?.id ?? picked?.id ?? null);
  const part = !focused && picked?.id === fileId ? picked.part : null;
  return { fileId, part, fresh };
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
  const [picked, setPicked] = useState<Picked | null>(null);
  const shown = useExplain()?.focus ?? null;
  const { fileId, part, fresh } = openFile(files, picked, shown);
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-80 shrink-0 space-y-2 overflow-y-auto border-r border-zinc-200 p-2 dark:border-zinc-800">
        {picker}
        <FileList
          files={files}
          comments={comments}
          selected={fileId}
          onSelect={(id, under) => {
            setPicked({ id, part: under, seq: shown?.seq ?? 0 });
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
            focus={fresh}
          />
        )}
      </main>
    </div>
  );
}
