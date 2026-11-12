// What the review's open file runs on: the file read, the selected lines and its comments. Also its hunk focus
// (By spec) and Explain on the whole file.

import { useState } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { Selection } from '../../lib/review/diff-selection';
import type { ReviewTarget } from '../../lib/review/review-target';
import { useDiffFile } from '../../lib/review/use-review';
import { useWholeExplain, type ExplainFocus, type WholeExplain } from './explain-context';
import { useHunkFocus } from './hunk-focus';

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

type OpenFileState = {
  file: ReturnType<typeof useDiffFile>;
  selection: Selection | null;
  setSelection: (selection: Selection | null) => void;
  /** The comments on this file. */
  forFile: CommentView[];
  focus: ReturnType<typeof useHunkFocus>;
  whole: WholeExplain | undefined;
};

/** `shown`: lines an explanation in the panel shows; `part`: the spec part the file was picked under. */
export function useOpenFile({
  target,
  fileId,
  comments,
  part,
  shown,
}: {
  target: ReviewTarget;
  fileId: number;
  comments: CommentView[];
  part: string | null;
  shown: ExplainFocus | null;
}): OpenFileState {
  const file = useDiffFile(target, fileId);
  const [selection, setSelection] = useSelection(shown, file.data?.path);
  const forFile = comments.filter((comment) => comment.path === file.data?.path);
  const focus = useHunkFocus(target, part, file.data, forFile);
  const whole = useWholeExplain(file.data?.path);
  return { file, selection, setSelection, forFile, focus, whole };
}
