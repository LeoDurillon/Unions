import { describe, expect, test } from 'bun:test';

import { formatDuration, runsDuration } from './duration';

describe('formatDuration', () => {
  test('says seconds, minutes and hours in their two largest units', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(203_000)).toBe('3m 23s');
    expect(formatDuration(240_000)).toBe('4m');
    expect(formatDuration(4_920_000)).toBe('1h 22m');
    expect(formatDuration(7_200_000)).toBe('2h');
    expect(formatDuration(-5)).toBe('0s');
  });
});

describe('runsDuration', () => {
  test('adds the finished runs and skips the one still going', () => {
    const runs = [
      { startedAt: 0, finishedAt: 1000 },
      { startedAt: 5000, finishedAt: 7000 },
      { startedAt: 9000, finishedAt: null },
    ];
    expect(runsDuration(runs)).toBe(3000);
  });
});
