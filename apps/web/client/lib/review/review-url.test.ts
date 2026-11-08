// Tests for reading the review's slice, pull request and lines from the URL.
import { describe, expect, test } from 'bun:test';

import { diffLinesOf, positiveOf } from './review-url';

describe('positiveOf', () => {
  test('reads a positive position', () => {
    expect(positiveOf('1')).toBe(1);
    expect(positiveOf('12')).toBe(12);
  });

  test('anything else is All', () => {
    for (const value of [null, '', '0', '-1', '1.5', '2x', ' 2', 'all']) {
      expect(positiveOf(value)).toBeNull();
    }
  });
});

describe('diffLinesOf', () => {
  test('reads the side, the lines and a path that may hold colons', () => {
    expect(diffLinesOf('new:12-30:src/a.ts')).toEqual({
      path: 'src/a.ts',
      side: 'new',
      start: 12,
      end: 30,
    });
    expect(diffLinesOf('old:3-3:docs/a:b.md')).toEqual({
      path: 'docs/a:b.md',
      side: 'old',
      start: 3,
      end: 3,
    });
  });

  test('anything else names no lines', () => {
    for (const value of [null, '', 'new:12:src/a.ts', 'mid:1-2:a.ts', 'new:1-2:']) {
      expect(diffLinesOf(value)).toBeNull();
    }
  });
});
