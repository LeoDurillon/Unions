// Tests the findings read from the calls' tokens: large sessions, costly tickets and many review rounds.
import { expect, test } from 'bun:test';

import { callFindings, type CallRecord } from './usage-findings';

function call(ticketId: number, step: string, peakContext: number, cost = 1): CallRecord {
  return { ticketId, step, peakContext, costMicroUsd: cost };
}

test('a step whose calls average a large context is named, with its largest tickets', () => {
  const found = callFindings([
    call(1, 'implement', 400_000),
    call(2, 'implement', 100_000),
    call(3, 'implement', 600_000),
    call(1, 'intake', 50_000),
  ]);
  expect(found).toEqual([
    {
      kind: 'large_sessions',
      actor: 'union',
      items: [{ label: 'implement', value: 366_667, calls: 3, tickets: [3, 1, 2] }],
    },
  ]);
});

test('a ticket costing three times the median is costly, from five tickets on', () => {
  const calls = [1, 2, 3, 4].map((id) => call(id, 'implement', 0, 10));
  expect(callFindings(calls)).toEqual([]);
  const found = callFindings([...calls, call(5, 'implement', 0, 31), call(5, 'implement', 0, 1)]);
  expect(found).toEqual([
    {
      kind: 'costly_tickets',
      actor: 'union',
      items: [{ label: '', value: 32, calls: 2, tickets: [5] }],
    },
  ]);
});

test('a ticket reviewed more than three times is named', () => {
  const reviews = [1, 2, 3, 4].map(() => call(7, 'final_review', 0));
  expect(callFindings(reviews.slice(1))).toEqual([]);
  expect(callFindings(reviews)[0]).toMatchObject({
    kind: 'review_rounds',
    items: [{ value: 4, tickets: [7] }],
  });
});
