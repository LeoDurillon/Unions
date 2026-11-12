import { describe, expect, test } from 'bun:test';

import { summarizeUsage, weekStart, type UsageRecord } from './usage-summary';

// Monday 2026-11-02, 00:00 UTC.
const MONDAY = Date.UTC(2026, 10, 2);
const DAY = 86_400_000;

function row(over: Partial<UsageRecord>): UsageRecord {
  return {
    ticketId: 1,
    title: 'Fix the export',
    issueNumber: 12,
    step: 'implement',
    model: 'claude-opus',
    main: true,
    input: 10,
    cacheRead: 80,
    cacheWrite: 10,
    output: 5,
    costMicroUsd: 1_500_000,
    at: MONDAY + DAY,
    ...over,
  };
}

describe('weekStart', () => {
  test('the Monday of the week, at midnight UTC', () => {
    expect(weekStart(MONDAY)).toBe(MONDAY);
    expect(weekStart(MONDAY + 6 * DAY + 1000)).toBe(MONDAY);
    expect(weekStart(MONDAY - 1)).toBe(MONDAY - 7 * DAY);
  });
});

describe('summarizeUsage', () => {
  const rows = [
    row({}),
    // A subagent's model in the same call: its cost counts, not as a call.
    row({ model: 'claude-haiku', main: false, costMicroUsd: 500_000 }),
    row({
      ticketId: 2,
      title: 'Add a filter',
      issueNumber: null,
      step: 'technical',
      costMicroUsd: 3_000_000,
    }),
    row({ ticketId: null, title: null, step: null, costMicroUsd: 250_000, at: MONDAY - 3 * DAY }),
  ];
  const usage = summarizeUsage(rows, null, MONDAY + 2 * DAY);

  test('the total counts each call once and every model’s cost', () => {
    expect(usage.total).toEqual({ calls: 3, input: 400, output: 20, costUsd: 5.25 });
  });

  test('every week from the first row, empty ones included', () => {
    expect(usage.weeks.map((week) => [week.start, week.costUsd])).toEqual([
      [MONDAY - 7 * DAY, 0.25],
      [MONDAY, 5],
    ]);
  });

  test('steps, models and tickets, most expensive first; investigations apart', () => {
    expect(usage.steps.map((step) => [step.step, step.costUsd])).toEqual([
      ['technical', 3],
      ['implement', 2],
    ]);
    expect(usage.models.map((model) => model.model)).toEqual(['claude-opus', 'claude-haiku']);
    expect(usage.tickets.map((ticket) => [ticket.ticketId, ticket.title])).toEqual([
      [2, 'Add a filter'],
      [1, 'Fix the export'],
    ]);
    expect(usage.investigations).toEqual({ calls: 1, input: 100, output: 5, costUsd: 0.25 });
  });

  test('nothing used: no weeks without a range, the range’s weeks with one', () => {
    expect(summarizeUsage([], null, MONDAY).weeks).toEqual([]);
    expect(summarizeUsage([], MONDAY - 8 * DAY, MONDAY).weeks).toHaveLength(3);
  });
});
