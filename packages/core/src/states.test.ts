import { expect, test } from 'bun:test';

import {
  boardColumn,
  boardStatus,
  InvalidTransition,
  leftBoard,
  MERGED_VISIBLE_MS,
  transition,
  type Phase,
} from './states';

test('happy path walks every step then ends done', () => {
  let p: Phase = { kind: 'backlog' };
  p = transition(p, { type: 'start' });
  const seen: string[] = [];
  while (p.kind !== 'done') {
    if (p.kind === 'running') {
      seen.push(p.step);
      p = transition(p, { type: 'run_finished' });
    } else {
      p = transition(p, { type: 'approve' });
    }
  }
  expect(seen).toEqual([
    'intake',
    'summary',
    'technical',
    'test_plan',
    'implement',
    'final_review',
  ]);
});

test('revise re-runs the same step', () => {
  const p = transition({ kind: 'awaiting_approval', step: 'technical' }, { type: 'revise' });
  expect(p).toEqual({ kind: 'running', step: 'technical' });
});

test('rate limit and failure are retried on the same step', () => {
  const limited = transition(
    { kind: 'running', step: 'summary' },
    { type: 'rate_limited', retryAt: 1 },
  );
  expect(transition(limited, { type: 'retry' })).toEqual({ kind: 'running', step: 'summary' });
  const failed = transition(
    { kind: 'running', step: 'summary' },
    { type: 'run_failed', error: 'x' },
  );
  expect(transition(failed, { type: 'retry' })).toEqual({ kind: 'running', step: 'summary' });
});

test('invalid transitions throw', () => {
  expect(() => transition({ kind: 'backlog' }, { type: 'approve' })).toThrow(InvalidTransition);
  expect(() => transition({ kind: 'running', step: 'intake' }, { type: 'approve' })).toThrow(
    InvalidTransition,
  );
  expect(() => transition({ kind: 'done' }, { type: 'cancel' })).toThrow(InvalidTransition);
});

test('board status mapping', () => {
  expect(boardStatus({ kind: 'backlog' })).toBe('backlog');
  expect(boardStatus({ kind: 'running', step: 'technical' })).toBe('in_progress');
  expect(boardStatus({ kind: 'awaiting_approval', step: 'final_review' })).toBe('in_review');
  expect(boardStatus({ kind: 'done' })).toBe('done');
});

test('changes requested at the final review go to the implementer, then the review runs again', () => {
  const fixing = transition(
    { kind: 'awaiting_approval', step: 'final_review' },
    { type: 'revise' },
  );
  expect(fixing).toEqual({ kind: 'running', step: 'implement', thenRun: 'final_review' });
  expect(transition(fixing, { type: 'run_finished' })).toEqual({
    kind: 'running',
    step: 'final_review',
  });
  expect(boardStatus(fixing)).toBe('in_progress');
});

test('a chained run that fails stops and waits like any other failure', () => {
  const fixing: Phase = { kind: 'running', step: 'implement', thenRun: 'final_review' };
  const failed = transition(fixing, { type: 'run_failed', error: 'boom' });
  expect(failed).toEqual({ kind: 'failed', step: 'implement', error: 'boom' });
  expect(transition(failed, { type: 'retry' })).toEqual({ kind: 'running', step: 'implement' });
});

test('approving the final review finishes the ticket', () => {
  expect(
    transition({ kind: 'awaiting_approval', step: 'final_review' }, { type: 'approve' }),
  ).toEqual({
    kind: 'done',
  });
});

test('a rebase from the final review or from done chains into a new final review', () => {
  const rebasing: Phase = { kind: 'running', step: 'rebase', thenRun: 'final_review' };
  expect(
    transition({ kind: 'awaiting_approval', step: 'final_review' }, { type: 'rebase' }),
  ).toEqual(rebasing);
  expect(transition({ kind: 'done' }, { type: 'rebase' })).toEqual(rebasing);
  expect(transition(rebasing, { type: 'run_finished' })).toEqual({
    kind: 'running',
    step: 'final_review',
  });
  expect(boardStatus(rebasing)).toBe('in_review');
});

test('a failed rebase is retried as a rebase that still chains into the review', () => {
  const failed = transition(
    { kind: 'running', step: 'rebase', thenRun: 'final_review' },
    {
      type: 'run_failed',
      error: 'conflict',
    },
  );
  expect(failed).toEqual({ kind: 'failed', step: 'rebase', error: 'conflict' });
  expect(transition(failed, { type: 'retry' })).toEqual({
    kind: 'running',
    step: 'rebase',
    thenRun: 'final_review',
  });
});

test('a rebase is refused before the final review and once cancelled', () => {
  for (const phase of [
    { kind: 'awaiting_approval', step: 'implement' },
    { kind: 'running', step: 'final_review' },
    { kind: 'backlog' },
    { kind: 'cancelled' },
  ] satisfies Phase[]) {
    expect(() => transition(phase, { type: 'rebase' })).toThrow(InvalidTransition);
  }
});

test('a done ticket can be sent back with a review: the implementer, then a new final review', () => {
  expect(transition({ kind: 'done' }, { type: 'revise' })).toEqual({
    kind: 'running',
    step: 'implement',
    thenRun: 'final_review',
  });
  expect(() => transition({ kind: 'done' }, { type: 'approve' })).toThrow(InvalidTransition);
  expect(() => transition({ kind: 'cancelled' }, { type: 'revise' })).toThrow(InvalidTransition);
});

test('a refused commit pauses the run, keeping its chain, until the user decides', () => {
  const paused = transition(
    { kind: 'running', step: 'rebase', thenRun: 'final_review' },
    { type: 'commit_refused' },
  );
  expect(paused).toEqual({ kind: 'commit_refused', step: 'rebase', thenRun: 'final_review' });
  expect(boardStatus(paused)).toBe('in_review');
  expect(transition(paused, { type: 'commit_anyway' })).toEqual({
    kind: 'running',
    step: 'rebase',
    thenRun: 'final_review',
    resume: 'commit',
  });
  expect(transition(paused, { type: 'drop_leftovers' })).toEqual({
    kind: 'running',
    step: 'rebase',
    thenRun: 'final_review',
    resume: 'discard',
  });
  expect(() => transition(paused, { type: 'revise' })).toThrow(InvalidTransition);
  expect(transition(paused, { type: 'cancel' })).toEqual({ kind: 'cancelled' });
});

test('the implementer can be sent back with guidance after a refused commit', () => {
  const paused = transition({ kind: 'running', step: 'implement' }, { type: 'commit_refused' });
  expect(transition(paused, { type: 'revise' })).toEqual({ kind: 'running', step: 'implement' });
  expect(() => transition(paused, { type: 'approve' })).toThrow(InvalidTransition);
});

function merged(at: number | null): { prState: 'merged'; prMergedAt: number | null } {
  return { prState: 'merged', prMergedAt: at };
}

test('a merged pull request puts the ticket in Merged for three weeks', () => {
  const done: Phase = { kind: 'done' };
  expect(boardColumn({ phase: done, prState: 'open' })).toBe('done');
  expect(boardColumn({ phase: done, prState: 'merged' })).toBe('merged');
  // Merged by hand before the final review ended: still merged.
  expect(
    boardColumn({ phase: { kind: 'awaiting_approval', step: 'final_review' }, prState: 'merged' }),
  ).toBe('merged');
  const now = 10 * MERGED_VISIBLE_MS;
  expect(leftBoard(merged(now - MERGED_VISIBLE_MS + 1), now)).toBe(false);
  expect(leftBoard(merged(now - MERGED_VISIBLE_MS), now)).toBe(true);
  expect(leftBoard(merged(null), now)).toBe(false);
  expect(leftBoard({ prState: 'closed', prMergedAt: null }, now)).toBe(false);
});
