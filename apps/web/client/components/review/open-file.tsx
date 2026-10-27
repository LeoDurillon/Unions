// One file of the review: its diff, the threads under their lines, and the outdated comments.
import { useState, type ReactElement } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { Selection } from '../../lib/diff-selection';
import type { ReviewTarget } from '../../lib/review-target';
import { useDiffFile, type useCommentMutations } from '../../lib/use-review';
import { ErrorText } from '../ui';
import { hasThread, OutdatedComments, Thread } from './comment-thread';
import { useWholeExplain, type ExplainFocus, type WholeExplain } from './explain-context';
import { useHunkFocus } from './hunk-focus';
import { ReportFileDiff, type DiffView } from './report-file-diff';

type Mutations = ReturnType<typeof useCommentMutations>;

/** The selected lines: the user's, or the ones an explanation opened in the panel shows, until the user selects others. */
function useSelection(
  focus: ExplainFocus | null,
  path: string | undefined,
): [Selection | null, (selection: Selection | null) => void] {
  const [own, setOwn] = useState<{ selection: Selection | null; seq: number }>({
    selection: null,
    seq: 0,
  });
  const shows = focus !== null && focus.path === path && focus.seq > own.seq;
  const selection = shows
    ? { side: focus.side, start: focus.start, end: focus.end }
    : own.selection;
  return [
    selection,
    (next) => {
      setOwn({ selection: next, seq: Math.max(own.seq, focus?.seq ?? 0) });
    },
  ];
}

function FileHeader({
  path,
  patch,
  whole,
}: {
  path: string;
  patch: string;
  whole: WholeExplain | undefined;
}): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <h3 className="font-mono text-sm font-semibold">{path}</h3>
      {whole ? (
        <button
          type="button"
          className="text-xs text-indigo-700 hover:underline dark:text-indigo-300"
          onClick={() => {
            whole.file(patch);
          }}
        >
          Explain file
        </button>
      ) : null}
    </div>
  );
}

/** One file of the review: its diff, the threads under their lines, and the outdated comments. */
export function OpenFile({
  target,
  fileId,
  view,
  comments,
  mutations,
  part,
  focus: shown,
}: {
  target: ReviewTarget;
  fileId: number;
  view: DiffView;
  comments: CommentView[];
  mutations: Mutations;
  /** The part of the spec the file was picked under (By spec): only its hunks are shown. */
  part: string | null;
  /** Lines an explanation in the panel shows: selected while the user selects none. */
  focus: ExplainFocus | null;
}): ReactElement {
  const file = useDiffFile(target, fileId);
  const [selection, setSelection] = useSelection(shown, file.data?.path);
  const forFile = comments.filter((comment) => comment.path === file.data?.path);
  const focus = useHunkFocus(target, part, file.data, forFile);
  const whole = useWholeExplain(file.data?.path);
  if (!file.data) {
    return <ErrorText error={file.error} />;
  }
  const { path } = file.data;
  return (
    <div className="space-y-3">
      <FileHeader path={path} patch={file.data.patch} whole={whole} />
      {focus.bar}
      <OutdatedComments comments={forFile.filter((c) => c.outdated)} mutations={mutations} />
      <ReportFileDiff
        target={target}
        path={path}
        view={view}
        patch={focus.patch}
        hunkTags={focus.tags}
        onHunk={whole?.hunk}
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
