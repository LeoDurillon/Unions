import { expect, test } from 'bun:test';

import { clock, formatWhen, timeAgo, timeOfDay, timeUntil } from './relative-time';

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

test('how long until, to the minute', () => {
  const MINUTE = 60_000;
  expect(timeUntil(NOW + 5 * MINUTE, NOW)).toBe('in 5 min');
  expect(timeUntil(NOW + 100 * MINUTE, NOW)).toBe('in 1 h 40 min');
  expect(timeUntil(NOW + 120 * MINUTE - 1000, NOW)).toBe('in 2 h');
  expect(timeUntil(NOW + 3 * 24 * 60 * MINUTE, NOW)).toBe('in 3 days');
  expect(timeUntil(NOW - MINUTE, NOW)).toBe('now');
});

test('the time of day, with the weekday when it is not today', () => {
  const today = new Date(2026, 10, 8, 9, 0).getTime();
  const evening = new Date(2026, 10, 8, 18, 22);
  const time = evening.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  expect(timeOfDay(evening.getTime(), today)).toBe(time);
  const tuesday = new Date(2026, 10, 10, 18, 22);
  expect(timeOfDay(tuesday.getTime(), today)).toBe(
    `${tuesday.toLocaleDateString([], { weekday: 'short' })} ${time}`,
  );
});

test('a moment is written the same way everywhere, with the year only when it is not this one', () => {
  const now = new Date(2026, 10, 8, 21, 5).getTime();
  const sameYear = new Date(2026, 2, 3, 9, 7);
  const datetime = formatWhen(sameYear, 'datetime', now);
  expect(datetime).not.toContain('2026');
  expect(datetime).not.toMatch(/:\d\d:\d\d/u);
  expect(formatWhen(new Date(2025, 2, 3), 'date', now)).toContain('2025');
  expect(formatWhen(sameYear.getTime(), 'time', now)).toBe(
    sameYear.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  );
  expect(formatWhen(sameYear.toISOString(), 'date', now)).toBe(formatWhen(sameYear, 'date', now));
});
