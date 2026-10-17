import { expect, test } from 'bun:test';

import {
  boardColumn,
  boardStatus,
  InvalidTransition,
  leftBoard,
  MERGED_VISIBLE_MS,
  transition,
  type Flow,
  type Phase,
} from './states';

/** The steps a ticket on `flow` runs, approving each one. */
function walk(flow: Flow): string[] {
  let p: Phase = transition({ kind: 'backlog' }, { type: 'start' }, flow);
  const seen: string[] = [];
  while (p.kind !== 'done') {
    if (p.kind === 'running') {
      seen.push(p.step);
      p = transition(p, { type: 'run_finished' }, flow);
    } else {
      p = transition(p, { type: 'approve' }, flow);
    }
  }
  return seen;
}

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
  const fromDone = transition({ kind: 'done' }, { type: 'rebase' });
  expect(fromDone).toEqual({ ...rebasing, thenDone: true });
  for (const phase of [rebasing, fromDone]) {
    expect(transition(phase, { type: 'run_finished' })).toEqual({
      kind: 'running',
      step: 'final_review',
    });
  }
  expect(boardStatus(rebasing)).toBe('in_review');
});

test('a clean rebase goes back to the final review, or to done, without a new review', () => {
  const rebasing: Phase = { kind: 'running', step: 'rebase', thenRun: 'final_review' };
  expect(transition(rebasing, { type: 'rebased_clean' })).toEqual({
    kind: 'awaiting_approval',
    step: 'final_review',
  });
  expect(transition({ ...rebasing, thenDone: true }, { type: 'rebased_clean' })).toEqual({
    kind: 'done',
  });
  for (const phase of [
    { kind: 'running', step: 'implement' },
    { kind: 'running', step: 'simplify' },
    { kind: 'awaiting_approval', step: 'final_review' },
  ] satisfies Phase[]) {
    expect(() => transition(phase, { type: 'rebased_clean' })).toThrow(InvalidTransition);
  }
});

test('a rebase asked once done still goes back to done after a retry or a rate limit', () => {
  const rebasing: Phase = {
    kind: 'running',
    step: 'rebase',
    thenRun: 'final_review',
    thenDone: true,
  };
  const failed = transition(rebasing, { type: 'run_failed', error: 'boom' });
  expect(transition(failed, { type: 'retry' })).toEqual(rebasing);
  const limited = transition(rebasing, { type: 'rate_limited', retryAt: null });
  expect(transition(limited, { type: 'retry' })).toEqual(rebasing);
  const paused = transition(rebasing, { type: 'commit_refused' });
  expect(transition(paused, { type: 'commit_anyway' })).toEqual({ ...rebasing, resume: 'commit' });
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

test('a simplified history goes back to the final review, or to done, without a new review', () => {
  const fromReview = transition(
    { kind: 'awaiting_approval', step: 'final_review' },
    { type: 'simplify' },
  );
  expect(fromReview).toEqual({ kind: 'running', step: 'simplify' });
  expect(transition(fromReview, { type: 'run_finished' })).toEqual({
    kind: 'awaiting_approval',
    step: 'final_review',
  });
  const fromDone = transition({ kind: 'done' }, { type: 'simplify' });
  expect(fromDone).toEqual({ kind: 'running', step: 'simplify', thenDone: true });
  expect(transition(fromDone, { type: 'run_finished' })).toEqual({ kind: 'done' });
  expect(boardStatus(fromDone)).toBe('in_review');
});

test('a failed or rate-limited simplification asked once done still returns to done', () => {
  const running: Phase = { kind: 'running', step: 'simplify', thenDone: true };
  const failed = transition(running, { type: 'run_failed', error: 'tree changed' });
  expect(failed).toEqual({
    kind: 'failed',
    step: 'simplify',
    error: 'tree changed',
    thenDone: true,
  });
  expect(transition(failed, { type: 'retry' })).toEqual(running);
  const limited = transition(running, { type: 'rate_limited', retryAt: null });
  expect(transition(limited, { type: 'retry' })).toEqual(running);
});

test('a simplification paused on a refused commit still returns to done once decided', () => {
  const running: Phase = { kind: 'running', step: 'simplify', thenDone: true };
  const paused = transition(running, { type: 'commit_refused' });
  expect(paused).toEqual({ kind: 'commit_refused', step: 'simplify', thenDone: true });
  for (const type of ['commit_anyway', 'drop_leftovers'] as const) {
    const resumed = transition(paused, { type });
    expect(resumed).toMatchObject({ kind: 'running', step: 'simplify', thenDone: true });
    expect(transition(resumed, { type: 'run_finished' })).toEqual({ kind: 'done' });
  }
  expect(() => transition(paused, { type: 'revise' })).toThrow(InvalidTransition);
});

test('a simplification is refused before the final review and while a step runs', () => {
  for (const phase of [
    { kind: 'awaiting_approval', step: 'implement' },
    { kind: 'running', step: 'final_review' },
    { kind: 'failed', step: 'rebase', error: 'conflict' },
    { kind: 'backlog' },
    { kind: 'cancelled' },
  ] satisfies Phase[]) {
    expect(() => transition(phase, { type: 'simplify' })).toThrow(InvalidTransition);
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

function ended(
  prState: 'merged' | 'closed',
  at: number | null,
): { prState: 'merged' | 'closed'; prMergedAt: number | null; prClosedAt: number | null } {
  return prState === 'merged'
    ? { prState, prMergedAt: at, prClosedAt: null }
    : { prState, prMergedAt: null, prClosedAt: at };
}

test('a merged or closed pull request puts the ticket in Merged / Closed for three weeks', () => {
  const done: Phase = { kind: 'done' };
  expect(boardColumn({ phase: done, prState: 'open' })).toBe('done');
  expect(boardColumn({ phase: done, prState: 'merged' })).toBe('merged');
  expect(boardColumn({ phase: done, prState: 'closed' })).toBe('merged');
  // Merged by hand before the final review ended: still merged.
  expect(
    boardColumn({ phase: { kind: 'awaiting_approval', step: 'final_review' }, prState: 'merged' }),
  ).toBe('merged');
  const now = 10 * MERGED_VISIBLE_MS;
  for (const state of ['merged', 'closed'] as const) {
    expect(leftBoard(ended(state, now - MERGED_VISIBLE_MS + 1), now)).toBe(false);
    expect(leftBoard(ended(state, now - MERGED_VISIBLE_MS), now)).toBe(true);
    expect(leftBoard(ended(state, null), now)).toBe(false);
  }
  expect(leftBoard({ prState: 'open', prMergedAt: null, prClosedAt: null }, now)).toBe(false);
});

test('a flow runs only its steps, in order', () => {
  expect(walk(['implement', 'final_review'])).toEqual(['implement', 'final_review']);
  expect(walk(['technical', 'implement', 'final_review'])).toEqual([
    'technical',
    'implement',
    'final_review',
  ]);
});

test('changes asked at the final review of a short flow go back to the implementer', () => {
  const flow: Flow = ['implement', 'final_review'];
  const review: Phase = { kind: 'awaiting_approval', step: 'final_review' };
  expect(transition(review, { type: 'revise' }, flow)).toEqual({
    kind: 'running',
    step: 'implement',
    thenRun: 'final_review',
  });
});
