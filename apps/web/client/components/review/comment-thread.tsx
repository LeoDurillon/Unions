// The comments ending on one line, and the editor when the selection ends there.
import type { ReactElement } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { Selection } from '../../lib/diff-selection';
import type { useCommentMutations } from '../../lib/use-review';
import { ReviewCommentCard } from './comment-card';
import { CommentEditor } from './comment-editor';

type Mutations = ReturnType<typeof useCommentMutations>;

/** Whether a line shows a thread: current comments end on it, or the selection being commented does. */
export function hasThread(
  comments: CommentView[],
  selection: Selection | null,
  side: 'old' | 'new',
  line: number,
): boolean {
  const editing = selection?.side === side && selection.end === line;
  return editing || comments.some((comment) => !comment.outdated);
}

/** The comments ending on one line, and the editor when the selection ends there. */
export function Thread({
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
        <ReviewCommentCard key={comment.id} comment={comment} mutations={mutations} />
      ))}
      {editing ? (
        <CommentEditor
          path={path}
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

/** Comments left on an older version of the file, collapsed. */
export function OutdatedComments({
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
          <ReviewCommentCard key={comment.id} comment={comment} mutations={mutations} showExcerpt />
        ))}
      </div>
    </details>
  );
}
