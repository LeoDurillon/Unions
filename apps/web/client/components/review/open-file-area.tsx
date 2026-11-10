// The review diff's right side: the banner, errors, general comments and the open file.

import type { ReactElement, ReactNode } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review/review-target';
import type { useCommentMutations } from '../../lib/review/use-review';
import { ErrorText } from '../ui';
import type { ExplainFocus } from './explain-context';
import type { DiffView } from './file-diff';
import { GeneralComments } from './general-comments';
import { OpenFile } from './open-file';

export type Mutations = ReturnType<typeof useCommentMutations>;

/** The right side: the banner, errors, general comments and the open file. */
export function OpenFileArea({
  target,
  comments,
  view,
  mutations,
  banner,
  error,
  emptyText,
  open,
}: {
  target: ReviewTarget;
  comments: CommentView[];
  view: DiffView;
  mutations: Mutations;
  banner: ReactNode;
  error: Error | null;
  emptyText: string | null;
  open: { fileId: number; part: string | null; focus: ExplainFocus | null } | null;
}): ReactElement {
  return (
    <main className="min-w-0 flex-1 overflow-y-auto p-4">
      {banner}
      <ErrorText error={error} />
      {emptyText ? <p className="text-sm text-zinc-500">{emptyText}</p> : null}
      <GeneralComments comments={comments} mutations={mutations} />
      {open === null ? null : (
        <OpenFile
          key={`${open.fileId}-${open.part ?? ''}`}
          target={target}
          fileId={open.fileId}
          view={view}
          comments={comments}
          mutations={mutations}
          part={open.part}
          focus={open.focus}
        />
      )}
    </main>
  );
}
