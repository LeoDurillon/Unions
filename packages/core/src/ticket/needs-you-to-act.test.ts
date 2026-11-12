import { expect, test } from 'bun:test';

import { toAct } from './needs-you';

const WAITING = { phase: { kind: 'awaiting_approval' }, prState: null, prChecksState: null };
const MOVED_ON = { phase: { kind: 'done' }, prState: 'open', prChecksState: 'success' };

test('a ticket notification asks while the ticket still needs the user, and only unread', () => {
  expect(toAct({ kind: 'awaiting_approval', readAt: null }, WAITING)).toBe(true);
  expect(toAct({ kind: 'awaiting_approval', readAt: null }, MOVED_ON)).toBe(false);
  expect(toAct({ kind: 'awaiting_approval', readAt: 5 }, WAITING)).toBe(false);
  expect(toAct({ kind: 'failed', readAt: null }, null)).toBe(false);
});

test('merged, closed and usage limits only tell; an investigation answer asks until read', () => {
  expect(toAct({ kind: 'pull_request_merged', readAt: null }, null)).toBe(false);
  expect(toAct({ kind: 'rate_limited', readAt: null }, WAITING)).toBe(false);
  expect(toAct({ kind: 'investigation_finished', readAt: null }, null)).toBe(true);
});
