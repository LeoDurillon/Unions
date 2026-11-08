// Tests of the live stream's reconnect backoff and its status store.
import { expect, test } from 'bun:test';

import { reconnectDelay, setStreamStatus, isStreamStatus } from './stream-status';

test('a closed stream is reopened after 1 s, then twice as long each time, at most 30 s', () => {
  expect([0, 1, 2, 3, 4, 5, 20].map((attempt) => reconnectDelay(attempt))).toEqual([
    1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
  ]);
});

test('only the two statuses pass between tabs', () => {
  expect(isStreamStatus('live')).toBe(true);
  expect(isStreamStatus('reconnecting')).toBe(true);
  expect(isStreamStatus('down')).toBe(false);
  setStreamStatus('live');
});
