import { expect, test } from 'bun:test';

import { countsText, textCounts } from './text-counts';

test('lines and words, a final line break not counted as a line', () => {
  expect(textCounts('You are one agent.\nFollow the rules.\n')).toEqual({ lines: 2, words: 7 });
  expect(textCounts('   ')).toEqual({ lines: 0, words: 0 });
  expect(countsText('one two three')).toBe('1 line · 3 words');
});
