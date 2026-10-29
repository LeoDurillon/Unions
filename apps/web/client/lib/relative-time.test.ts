import { expect, test } from 'bun:test';

import { clock, timeAgo } from './relative-time';

const NOW = 864_000_000;

test('how long ago, in the largest unit', () => {
  expect(timeAgo(NOW - 20_000, NOW)).toBe('just now');
  expect(timeAgo(NOW - 300_000, NOW)).toBe('5 min ago');
  expect(timeAgo(NOW - 10_800_000, NOW)).toBe('3 h ago');
  expect(timeAgo(NOW - 86_400_000, NOW)).toBe('1 day ago');
  expect(timeAgo(NOW - 5 * 86_400_000, NOW)).toBe('5 days ago');
  expect(timeAgo(NOW + 1000, NOW)).toBe('just now');
});

test('durations as a clock', () => {
  expect(clock(7400)).toBe('0:07');
  expect(clock(72_000)).toBe('1:12');
  expect(clock(3_725_000)).toBe('1:02:05');
});
