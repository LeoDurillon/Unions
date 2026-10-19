import { expect, test } from 'bun:test';

import { anchorOf, fileSelection, hunkSelection, isSelected, select } from './diff-selection';

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

test('Explain on a hunk takes its new lines, or its old ones when it only removes', () => {
  expect(hunkSelection('@@ -10,3 +12,4 @@ fn()')).toEqual({ side: 'new', start: 12, end: 15 });
  expect(hunkSelection('@@ -10,2 +9,0 @@')).toEqual({ side: 'old', start: 10, end: 11 });
  expect(hunkSelection('not a header')).toBeNull();
});

test('Explain on a file takes every changed line, first hunk to last', () => {
  const patch = '@@ -1,2 +1,3 @@\n a\n+b\n c\n@@ -20,2 +21,2 @@\n-x\n+y\n z';
  expect(fileSelection(patch)).toEqual({ side: 'new', start: 1, end: 22 });
  expect(fileSelection('@@ -1,2 +0,0 @@\n-a\n-b')).toEqual({ side: 'old', start: 1, end: 2 });
  expect(fileSelection('')).toBeNull();
});
