import { expect, test } from 'bun:test';

import { anchorOf, isSelected, select } from './diff-selection';

test('removed lines anchor on the old side, added and context lines on the new side', () => {
  expect(anchorOf({ kind: 'del', oldLine: 4, text: '' })).toEqual({ side: 'old', number: 4 });
  expect(anchorOf({ kind: 'add', newLine: 6, text: '' })).toEqual({ side: 'new', number: 6 });
  expect(anchorOf({ kind: 'context', oldLine: 3, newLine: 5, text: '' })).toEqual({
    side: 'new',
    number: 5,
  });
  expect(anchorOf({ kind: 'hunk', text: '@@' })).toBeNull();
});

test('shift-click extends a block on the same side, in either direction', () => {
  const first = select(null, 'new', 10, false);
  expect(select(first, 'new', 14, true)).toEqual({ side: 'new', start: 10, end: 14 });
  expect(select(first, 'new', 7, true)).toEqual({ side: 'new', start: 7, end: 10 });
  expect(select(first, 'old', 12, true)).toEqual({ side: 'old', start: 12, end: 12 });
  expect(select(first, 'new', 12, false)).toEqual({ side: 'new', start: 12, end: 12 });
  expect(isSelected({ side: 'new', start: 7, end: 10 }, 'new', 9)).toBe(true);
  expect(isSelected({ side: 'new', start: 7, end: 10 }, 'old', 9)).toBe(false);
});
