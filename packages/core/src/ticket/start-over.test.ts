// The start over action: which steps and phases it runs again from scratch, and the retries after.

import { expect, test } from 'bun:test';

import { InvalidTransition, transition, type Phase } from '../states';

test('a planning step awaiting approval starts over fresh', () => {
  const next = transition({ kind: 'awaiting_approval', step: 'technical' }, { type: 'start_over' });
  expect(next).toEqual({ kind: 'running', step: 'technical', fresh: true });
});

test('a failed or rate-limited custom step starts over fresh', () => {
  const failed: Phase = { kind: 'failed', step: 'agent_3', error: 'boom' };
  expect(transition(failed, { type: 'start_over' })).toEqual({
    kind: 'running',
    step: 'agent_3',
    fresh: true,
  });
  const limited: Phase = { kind: 'rate_limited', step: 'summary', retryAt: null };
  expect(transition(limited, { type: 'start_over' })).toEqual({
    kind: 'running',
    step: 'summary',
    fresh: true,
  });
});

test('steps that change the branch cannot start over', () => {
  for (const step of ['implement', 'final_review', 'split_plan'] as const) {
    expect(() => transition({ kind: 'awaiting_approval', step }, { type: 'start_over' })).toThrow(
      InvalidTransition,
    );
  }
  expect(() => transition({ kind: 'running', step: 'technical' }, { type: 'start_over' })).toThrow(
    InvalidTransition,
  );
  expect(() => transition({ kind: 'backlog' }, { type: 'start_over' })).toThrow(InvalidTransition);
});

test('a started-over run that stops retries fresh, then waits for approval as usual', () => {
  const fresh: Phase = { kind: 'running', step: 'technical', fresh: true };
  const failed = transition(fresh, { type: 'run_failed', error: 'boom' });
  expect(failed).toEqual({ kind: 'failed', step: 'technical', error: 'boom', fresh: true });
  expect(transition(failed, { type: 'retry' })).toEqual(fresh);
  const limited = transition(fresh, { type: 'rate_limited', retryAt: 1 });
  expect(transition(limited, { type: 'retry' })).toEqual(fresh);
  expect(transition(fresh, { type: 'run_finished' })).toEqual({
    kind: 'awaiting_approval',
    step: 'technical',
  });
});
