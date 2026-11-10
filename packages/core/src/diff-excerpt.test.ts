// Tests for the excerpt of a patch's lines and the part of a range a line comment can take.
import { expect, test } from 'bun:test';

import { diffExcerpt, rangeInDiff } from './diff-excerpt';

const PATCH = '@@ -10,3 +10,2 @@\n ten\n-eleven\n twelve\n@@ -40,0 +39,2 @@\n+added\n+more';

test('the excerpt is the lines of the range on that side', () => {
  expect(diffExcerpt(PATCH, 'old', 10, 11)).toBe('ten\neleven');
  expect(diffExcerpt(PATCH, 'new', 30, 31)).toBeNull();
});

test('a range is trimmed to the first hunk it overlaps', () => {
  expect(rangeInDiff(PATCH, 'old', 11, 12)).toEqual({ startLine: 11, endLine: 12 });
  expect(rangeInDiff(PATCH, 'old', 8, 20)).toEqual({ startLine: 10, endLine: 12 });
  expect(rangeInDiff(PATCH, 'new', 10, 40)).toEqual({ startLine: 10, endLine: 11 });
  expect(rangeInDiff(PATCH, 'new', 39, 45)).toEqual({ startLine: 39, endLine: 40 });
});

test('a range outside every hunk, or on a side a hunk has no lines of, has none', () => {
  expect(rangeInDiff(PATCH, 'old', 20, 30)).toBeNull();
  expect(rangeInDiff(PATCH, 'old', 40, 40)).toBeNull();
});
