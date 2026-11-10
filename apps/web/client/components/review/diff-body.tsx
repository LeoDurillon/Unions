// The touched files on the left, the picked one on the right.

import { useState, type ReactElement, type ReactNode } from 'react';

import type { CommentView, DiffResponse } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review/review-target';
import { useExplain, type ExplainFocus } from './explain-context';
import type { DiffView } from './file-diff';
import { useFilteredFiles } from './file-filter-bar';
import { FileList } from './file-list';
import { OpenFileArea, type Mutations } from './open-file-area';

type Files = DiffResponse['files'];

/**
 * The picked file (shown or not), else the first listed file that is not ignored, else the first
 * listed, else the first file.
 */
function openFileId(files: Files, visible: Files, picked: number | null): number | null {
  const chosen = files.find((file) => file.id === picked);
  return (chosen ?? visible.find((file) => !file.ignored) ?? visible[0] ?? files[0])?.id ?? null;
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
  files: Files,
  visible: Files,
  picked: Picked | null,
  shown: ExplainFocus | null,
): { fileId: number | null; part: string | null; fresh: ExplainFocus | null } {
  const fresh = freshFocus(picked, shown);
  const focused = fresh ? files.find((file) => file.path === fresh.path) : undefined;
  const fileId = openFileId(files, visible, focused?.id ?? picked?.id ?? null);
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
  const { visible, bar } = useFilteredFiles(files);
  const { fileId, part, fresh } = openFile(files, visible, picked, shown);
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-80 shrink-0 space-y-2 overflow-y-auto border-r border-zinc-200 p-2 dark:border-zinc-800">
        {picker}
        <FileList
          files={visible}
          total={files.length}
          filterBar={bar}
          comments={comments}
          selected={fileId}
          onSelect={(id, under) => {
            setPicked({ id, part: under, seq: shown?.seq ?? 0 });
          }}
          part={part}
          target={target}
        />
      </aside>
      <OpenFileArea
        target={target}
        comments={comments}
        view={view}
        mutations={mutations}
        banner={banner}
        error={error}
        emptyText={emptyText}
        open={fileId === null ? null : { fileId, part, focus: fresh }}
      />
    </div>
  );
}
