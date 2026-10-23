// Which comments a split ticket's review shows on each tab: a slice's on its own, the rest on All.
import type { CommentView } from '../../src/api-types';

/**
 * Whether the comment shows on the tab of `slice` (null: All). A comment of a slice no longer in the
 * stack (a new split) shows on All, outdated.
 */
export function onSliceTab(
  comment: CommentView,
  slice: number | null,
  positions: ReadonlySet<number>,
): boolean {
  if (slice !== null) {
    return comment.slicePosition === slice;
  }
  return comment.slicePosition === null || !positions.has(comment.slicePosition);
}

/** The drafts on each tab, by slice position (null: All). */
export function draftsByTab(
  comments: readonly CommentView[],
  positions: ReadonlySet<number>,
): Map<number | null, number> {
  const counts = new Map<number | null, number>();
  for (const comment of comments) {
    if (comment.status === 'draft') {
      const tab =
        comment.slicePosition !== null && positions.has(comment.slicePosition)
          ? comment.slicePosition
          : null;
      counts.set(tab, (counts.get(tab) ?? 0) + 1);
    }
  }
  return counts;
}
