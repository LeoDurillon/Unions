// Tests for reading the review's slice from the URL.
import { describe, expect, test } from 'bun:test';

import { slicePositionOf } from './review-url';

describe('slicePositionOf', () => {
  test('reads a positive position', () => {
    expect(slicePositionOf('1')).toBe(1);
    expect(slicePositionOf('12')).toBe(12);
  });

  test('anything else is All', () => {
    for (const value of [null, '', '0', '-1', '1.5', '2x', ' 2', 'all']) {
      expect(slicePositionOf(value)).toBeNull();
    }
  });
});
