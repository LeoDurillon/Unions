import { useState, type ReactElement } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { Selection } from '../../lib/diff-selection';
import type { ReviewTarget } from '../../lib/review-target';
import { useDiffFile, type useCommentMutations } from '../../lib/use-review';
import { ErrorText } from '../ui';
import { hasThread, OutdatedComments, Thread } from './comment-thread';
import { FileDiff, type DiffView } from './file-diff';

type Mutations = ReturnType<typeof useCommentMutations>;

/** One file of the review: its diff, the threads under their lines, and the outdated comments. */
export function OpenFile({
  target,
  fileId,
  view,
  comments,
  mutations,
}: {
  target: ReviewTarget;
  fileId: number;
  view: DiffView;
  comments: CommentView[];
  mutations: Mutations;
}): ReactElement {
  const file = useDiffFile(target, fileId);
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
