import { describe, expect, test } from 'bun:test';

import { gettingStarted } from './getting-started';

const backlog = { board: 'backlog', phase: { kind: 'backlog' } } as const;

describe('gettingStarted', () => {
  test('a new project has nothing done', () => {
    expect(gettingStarted([], {})).toEqual({
      checks: false,
      ticket: false,
      start: false,
      plan: false,
      review: false,
    });
  });

  test('a blank check command does not count', () => {
    expect(gettingStarted([], { gateCommand: '  ' }).checks).toBe(false);
    expect(gettingStarted([], { gateCommand: 'bun test' }).checks).toBe(true);
  });

  test('a ticket in the backlog is written, not started', () => {
    const steps = gettingStarted([backlog], {});
    expect(steps.ticket).toBe(true);
    expect(steps.start).toBe(false);
  });

  test('a running ticket is started but not planned', () => {
    const steps = gettingStarted([{ board: 'in_progress', phase: { kind: 'running' } }], {});
    expect(steps.start).toBe(true);
    expect(steps.plan).toBe(false);
  });

  test('a ticket in review is planned, not reviewed', () => {
    const steps = gettingStarted([{ board: 'in_review', phase: { kind: 'running' } }], {});
    expect(steps.plan).toBe(true);
    expect(steps.review).toBe(false);
  });

  test('a merged ticket ticks every ticket step', () => {
    const steps = gettingStarted([backlog, { board: 'merged', phase: { kind: 'done' } }], {});
    expect([steps.ticket, steps.start, steps.plan, steps.review]).toEqual([true, true, true, true]);
  });
});
