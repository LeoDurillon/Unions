import { describe, expect, test } from 'bun:test';

import { plural } from './plural';

describe('plural', () => {
  test('keeps the word singular for one', () => {
    expect(plural(1, 'file')).toBe('1 file');
  });
  test('adds an s for zero and many', () => {
    expect(plural(0, 'file')).toBe('0 files');
    expect(plural(3, 'comment')).toBe('3 comments');
  });
  test('takes an irregular plural', () => {
    expect(plural(2, 'entry', 'entries')).toBe('2 entries');
  });
});
