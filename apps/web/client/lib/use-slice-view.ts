// The slice a split ticket's review page shows: its tabs, its target, its files and its comments.
import { useState } from 'react';

import type { CommentView, CommitsResponse, DiffResponse } from '../../src/api-types';
import { reviewBase, type ReviewTarget } from './review-target';
import { onSliceTab } from './slice-view';
import { useCommits, useSliceDiff } from './use-commits';

type Slices = NonNullable<CommitsResponse['slices']>;
const NO_SLICES: Slices = [];

export type SliceView = {
  /** The ticket's slices, bottom first; empty when it is not split (or not a ticket). */
  slices: Slices;
  slice: number | null;
  setSlice: (slice: number | null) => void;
  /** The target with the picked slice: its files, its comments' writes. */
  target: ReviewTarget;
  files: DiffResponse['files'];
  comments: CommentView[];
  error: Error | null;
};

/** `files` and `comments` are the whole change's: a picked slice shows its own instead. */
export function useSliceView(
  whole: ReviewTarget,
  files: DiffResponse['files'],
  comments: CommentView[],
): SliceView {
  const [picked, setPicked] = useState<number | null>(null);
  const base = reviewBase(whole);
  const commits = useCommits(base);
  const slices = whole.kind === 'ticket' ? (commits.data?.slices ?? NO_SLICES) : NO_SLICES;
  const positions = new Set(slices.map((slice) => slice.position));
  // A slice gone after a new split falls back to All.
  const slice = picked !== null && positions.has(picked) ? picked : null;
  const sliceDiff = useSliceDiff(base, slice);
  return {
    slices,
    slice,
    setSlice: setPicked,
    target: whole.kind === 'ticket' && slice !== null ? { ...whole, slice } : whole,
    files: slice === null ? files : (sliceDiff.data?.files ?? []),
    comments: comments.filter((comment) => onSliceTab(comment, slice, positions)),
    error: slice === null ? null : sliceDiff.error,
  };
}
