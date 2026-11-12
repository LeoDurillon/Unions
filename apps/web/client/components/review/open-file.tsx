// One file of the review: its header, its diff, the threads under their lines, and the outdated comments.

import type { ReactElement } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review/review-target';
import type { useCommentMutations } from '../../lib/review/use-review';
import { ErrorText } from '../ui/ui';
import { hasThread, OutdatedComments, Thread } from './comment-thread';
import type { ExplainFocus } from './explain-context';
import { FileHeader, type FileSize } from './open-file-header';
import { ReportFileDiff, type DiffView } from './report-file-diff';
import { useOpenFile } from './use-open-file';

type Mutations = ReturnType<typeof useCommentMutations>;

/** One file of the review: its diff, the threads under their lines, and the outdated comments. */
export function OpenFile({
  target,
  fileId,
  view,
  comments,
  mutations,
  part,
  focus: shown,
  size,
}: {
  target: ReviewTarget;
  fileId: number;
  size: FileSize;
  view: DiffView;
  comments: CommentView[];
  mutations: Mutations;
  /** The part of the spec the file was picked under (By spec): only its hunks are shown. */
  part: string | null;
  /** Lines an explanation in the panel shows: selected while the user selects none. */
  focus: ExplainFocus | null;
}): ReactElement {
  const open = useOpenFile({ target, fileId, comments, part, shown });
  const { file, selection, setSelection, forFile, focus, whole } = open;
  if (!file.data) {
    return <ErrorText error={file.error} />;
  }
  const { path } = file.data;
  return (
    <div className="space-y-3">
      <FileHeader file={{ ...file.data, ...size }} whole={whole} />
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
