import { hunksOf, keepHunks } from '@union/core/diff-hunks';
import { useState, type ReactElement, type ReactNode } from 'react';

import type { CommentView } from '../../../src/api-types';
import type { ReviewTarget } from '../../lib/review-target';
import { focusOf, hunkTags, inHunks, type Focus } from '../../lib/spec-hunks';
import { useReviewGrouping } from '../../lib/use-review-grouping';

function FocusBar({
  focus,
  shown,
  total,
  hiddenComments,
  showAll,
  onToggle,
}: {
  focus: Focus;
  shown: number;
  total: number;
  hiddenComments: number;
  showAll: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
      <span>
        {showAll
          ? `All ${total} hunks: ${shown} for ${focus.title}`
          : `Showing ${shown} of ${total} hunks for ${focus.title}`}
        {!showAll && hiddenComments > 0
          ? ` · ${hiddenComments} comment${hiddenComments === 1 ? '' : 's'} in the other hunks`
          : ''}
      </span>
      <button type="button" className="underline" onClick={onToggle}>
        {showAll ? `Only ${focus.title}` : 'Show all'}
      </button>
    </div>
  );
}

/**
 * A file opened under a part of the spec (By spec): only the hunks of that part, with a bar to show
 * them all, and each hunk header tagged with the parts it serves. A file opened otherwise, a part
 * that takes the whole file, or a grouping read at another commit change nothing.
 */
export function useHunkFocus(
  target: ReviewTarget,
  part: string | null,
  file: { path: string; patch: string } | undefined,
  comments: CommentView[],
): { patch: string; bar: ReactNode; tags: Map<string, string[]> | undefined } {
  const grouping = useReviewGrouping(target).grouping.data;
  const [showAll, setShowAll] = useState(false);
  const result = grouping?.status === 'succeeded' && !grouping.outdated ? grouping.result : null;
  if (!file || !result || part === null) {
    return { patch: file?.patch ?? '', bar: null, tags: undefined };
  }
  const hunks = hunksOf(file.patch);
  const tags = hunkTags(result, file.path, hunks);
  const focus = focusOf(result, part, file.path);
  if (!focus?.keys) {
    return { patch: file.patch, bar: null, tags };
  }
  const keys = new Set(focus.keys);
  const kept = hunks.filter((hunk) => keys.has(hunk.key));
  const hidden = comments.filter((comment) => !comment.outdated && !inHunks(kept, comment));
  return {
    patch: showAll ? file.patch : keepHunks(file.patch, keys),
    bar: (
      <FocusBar
        focus={focus}
        shown={kept.length}
        total={hunks.length}
        hiddenComments={hidden.length}
        showAll={showAll}
        onToggle={() => {
          setShowAll(!showAll);
        }}
      />
    ),
    tags,
  };
}
