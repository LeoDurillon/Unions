import { beforeEach, expect, test } from 'bun:test';

import { appendAgentLine } from '../agent/agent-log';
import { createDb, migrateDb, type Db } from '../db';
import { latestClaudeLimits, parseRateLimit } from './claude-limits';

function report(fiveHour: number, status = 'allowed'): unknown {
  return {
    type: 'rate_limit_event',
    rate_limit_info: {
      status,
      unifiedWindows: {
        five_hour: { utilization: fiveHour, resetsAt: 1_793_815_200 },
        seven_day: { utilization: 0.16, resetsAt: 1_794_358_800 },
      },
    },
  };
}

test('parseRateLimit reads both windows, resets in ms', () => {
  expect(parseRateLimit(report(0.89, 'allowed_warning'), 5)).toEqual({
    status: 'allowed_warning',
    fiveHour: { utilization: 0.89, resetsAt: 1_793_815_200_000 },
    sevenDay: { utilization: 0.16, resetsAt: 1_794_358_800_000 },
    at: 5,
  });
  expect(parseRateLimit({ type: 'assistant' }, 5)).toBeNull();
  expect(
    parseRateLimit({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }, 5),
  ).toBeNull();
});

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

test('the newest report wins, whoever made it; none before any', () => {
  expect(latestClaudeLimits(db)).toBeNull();
  appendAgentLine(db, { ticketId: 1, payload: report(0.4) });
  appendAgentLine(db, { investigationId: 2, payload: report(0.5) });
  appendAgentLine(db, { ticketId: 1, payload: { type: 'assistant', message: { content: [] } } });
  expect(latestClaudeLimits(db)?.fiveHour?.utilization).toBe(0.5);
});
