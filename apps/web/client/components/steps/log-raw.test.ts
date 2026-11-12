import { expect, test } from 'bun:test';

import type { LogEntry } from '@union/core';

import { rawLines } from './log-raw';

test('the raw output prints each agent line as JSON, with a marker per run', () => {
  const entries = [
    { source: 'event', event: { type: 'run_started', runId: 7, payload: { step: 'implement' } } },
    { source: 'agent', line: { payload: { type: 'system', subtype: 'init' } } },
    { source: 'event', event: { type: 'ticket_moved', runId: null, payload: {} } },
  ] as unknown as LogEntry[];
  expect(rawLines(entries)).toEqual([
    '── Run #7 · implement ──',
    '{"type":"system","subtype":"init"}',
  ]);
});
