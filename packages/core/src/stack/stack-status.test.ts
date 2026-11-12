import { expect, test } from 'bun:test';

import {
  bottomOpen,
  sliceBranch,
  slicePrBase,
  sliceRange,
  stackLabel,
  stackStatus,
  type StackSlice,
} from './stack-status';

function slice(position: number, change: Partial<StackSlice> = {}): StackSlice {
  return {
    position,
    branch: sliceBranch('12-billing', position, 3),
    tipSha: `tip${position}`,
    prState: 'open',
    mergedInto: null,
    ...change,
  };
}

const merged = (into: string): Partial<StackSlice> => ({ prState: 'merged', mergedInto: into });

test('the top slice is the ticket branch, the lower ones are numbered', () => {
  expect([1, 2, 3].map((position) => sliceBranch('12-billing', position, 3))).toEqual([
    '12-billing-s1',
    '12-billing-s2',
    '12-billing',
  ]);
});

test('a stack is merged once every slice merged into the base', () => {
  const partly = stackStatus([slice(1, merged('main')), slice(2), slice(3)], 'main');
  expect(partly).toEqual({ total: 3, merged: 1, outOfOrder: [], closed: [], complete: false });
  expect(stackLabel(partly)).toBe('Stack of 3 · 1 merged');
  const all = [slice(1, merged('main')), slice(2, merged('main')), slice(3, merged('main'))];
  expect(stackStatus(all, 'main').complete).toBe(true);
  expect(stackLabel(stackStatus([slice(1), slice(2)], 'main'))).toBe('Stack of 2');
});

test('the top slice merged first is out of order, and the stack is not merged', () => {
  const status = stackStatus([slice(1), slice(2), slice(3, merged('12-billing-s2'))], 'main');
  expect(status.outOfOrder).toEqual([3]);
  expect(status.complete).toBe(false);
  const everything = [
    slice(1, merged('main')),
    slice(2, merged('main')),
    slice(3, merged('12-billing-s2')),
  ];
  expect(stackStatus(everything, 'main').complete).toBe(false);
});

test('a closed slice is reported', () => {
  expect(stackStatus([slice(1, { prState: 'closed' }), slice(2)], 'main').closed).toEqual([1]);
});

test('each slice is compared with the one below, the bottom with the base', () => {
  const slices = [slice(1), slice(2), slice(3)];
  expect(sliceRange(slices, 1, 'main')).toEqual({ from: 'main', to: 'tip1' });
  expect(sliceRange(slices, 3, 'main')).toEqual({ from: 'tip2', to: 'tip3' });
  expect(sliceRange(slices, 4, 'main')).toBeNull();
});

test('pull requests target the slice below, the bottom open one the base', () => {
  const slices = [slice(1, merged('main')), slice(2), slice(3)];
  expect(bottomOpen(slices)?.position).toBe(2);
  expect(slicePrBase(slices, 2, 'main')).toBe('main');
  expect(slicePrBase(slices, 3, 'main')).toBe('12-billing-s2');
  expect(slicePrBase(slices, 1, 'main')).toBe('main');
  expect(slicePrBase(slices, 9, 'main')).toBeNull();
});
