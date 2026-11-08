// Tests of when a step the usage limit paused is retried: after the reset it named, a full window's, or in 30 minutes.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type Db } from '@union/core';

import { rateLimited, retryTime } from './step-outcome';

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 10, 8, 15, 0);
const FIVE_HOUR_RESET = NOW + 90 * MINUTE;
const SEVEN_DAY_RESET = NOW + 3 * 24 * 60 * MINUTE;

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

function report(fiveHour: number, sevenDay: number): void {
  const payload = {
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'rejected',
      unifiedWindows: {
        five_hour: { utilization: fiveHour, resetsAt: FIVE_HOUR_RESET / 1000 },
        seven_day: { utilization: sevenDay, resetsAt: SEVEN_DAY_RESET / 1000 },
      },
    },
  };
  db.insert(schema.agentLog).values({ afterSeq: 0, payload, at: NOW }).run();
}

test('a known reset is retried two minutes after it', () => {
  expect(rateLimited({ kind: 'rate_limited', message: 'x', resetsAt: NOW })).toEqual({
    kind: 'rate_limited',
    retryAt: NOW + 2 * MINUTE,
  });
  expect(retryTime(db, NOW + 2 * MINUTE, NOW)).toBe(NOW + 2 * MINUTE);
});

test('an unknown reset waits for the full window the last report shows', () => {
  report(1, 0.4);
  expect(retryTime(db, null, NOW)).toBe(FIVE_HOUR_RESET + 2 * MINUTE);
  report(0.5, 1);
  expect(retryTime(db, null, NOW)).toBe(SEVEN_DAY_RESET + 2 * MINUTE);
});

test('with no full window reported, the retry is in 30 minutes', () => {
  expect(retryTime(db, null, NOW)).toBe(NOW + 30 * MINUTE);
  report(0.5, 0.4);
  expect(retryTime(db, null, NOW)).toBe(NOW + 30 * MINUTE);
});
