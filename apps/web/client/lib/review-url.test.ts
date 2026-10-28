// Tests for reading the review's slice and pull request from the URL.
import { describe, expect, test } from 'bun:test';

import { positiveOf } from './review-url';

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
