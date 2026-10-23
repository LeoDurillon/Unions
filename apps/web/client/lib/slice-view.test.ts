import { expect, test } from 'bun:test';

import type { CommentView } from '../../src/api-types';
import { draftsByTab, onSliceTab } from './slice-view';

function comment(id: number, slicePosition: number | null, status = 'draft'): CommentView {
  return { id, slicePosition, status } as CommentView;
}

const POSITIONS = new Set([1, 2]);
// 9: a slice of an earlier split, no longer in the stack.
const COMMENTS = [comment(1, null), comment(2, 1), comment(3, 2, 'sent'), comment(4, 9)];

function ids(slice: number | null): number[] {
  return COMMENTS.filter((one) => onSliceTab(one, slice, POSITIONS)).map((one) => one.id);
}

test("a slice's tab shows its comments; All the whole change's and those of slices gone", () => {
  expect(ids(null)).toEqual([1, 4]);
  expect(ids(1)).toEqual([2]);
  expect(ids(2)).toEqual([3]);
});

test('drafts are counted on the tab they show on, sent ones not at all', () => {
  expect([...draftsByTab(COMMENTS, POSITIONS)]).toEqual([
    [null, 2],
    [1, 1],
  ]);
});
