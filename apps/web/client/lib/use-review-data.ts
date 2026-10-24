// What a review page reads and writes: the diff, the comments and their writes, the picked slice of a
// split ticket, and the wording for the target.
import type { CommentView } from '../../src/api-types';
import { reviewCopy, type ReviewTarget } from './review-target';
import { useCommentMutations, useComments, useDiff } from './use-review';
import { useSliceView, type SliceView } from './use-slice-view';

type Mutations = ReturnType<typeof useCommentMutations>;

/**
 * The diff, the comments and their writes, and the wording for the target. `comments` are all of
 * them (the header counts them); `slices` has what the picked slice of a split ticket shows.
 */
export function useReviewData(
  target: ReviewTarget,
  posting: boolean,
): {
  diff: ReturnType<typeof useDiff>;
  comments: CommentView[];
  slices: SliceView;
  error: Error | null;
  mutations: Mutations;
  copy: ReturnType<typeof reviewCopy>;
  empty: boolean;
} {
  const diff = useDiff(target);
  const comments = useComments(target, posting);
  const files = diff.data?.files ?? [];
  const slices = useSliceView(target, files, comments.data ?? []);
  return {
    diff,
    comments: comments.data ?? [],
    slices,
    error: diff.error ?? comments.error ?? slices.error,
    mutations: useCommentMutations(slices.target),
    copy: reviewCopy(target),
    // A slice always has files: none is only its diff still loading.
    empty:
      slices.slice === null &&
      diff.data !== undefined &&
      (diff.data.snapshot === null || files.length === 0),
  };
}
