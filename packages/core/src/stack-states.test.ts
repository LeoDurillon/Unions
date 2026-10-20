import { expect, test } from 'bun:test';

import { boardStatus, InvalidTransition, transition, type Phase } from './states';

const atReview: Phase = { kind: 'awaiting_approval', step: 'final_review' };

test('a split asked at the final review plans, waits, splits, then comes back to the review', () => {
  let p = transition(atReview, { type: 'split' });
  expect(p).toEqual({ kind: 'running', step: 'split_plan' });
  p = transition(p, { type: 'run_finished' });
  expect(p).toEqual({ kind: 'awaiting_approval', step: 'split_plan' });
  p = transition(p, { type: 'approve' });
  expect(p).toEqual({ kind: 'running', step: 'split' });
  expect(transition(p, { type: 'run_finished' })).toEqual(atReview);
});

test('a split asked once done keeps going back to done, through the plan and its revisions', () => {
  let p = transition({ kind: 'done' }, { type: 'split' });
  expect(p).toEqual({ kind: 'running', step: 'split_plan', thenDone: true });
  p = transition(p, { type: 'run_finished' });
  expect(p).toEqual({ kind: 'awaiting_approval', step: 'split_plan', thenDone: true });
  p = transition(p, { type: 'revise' });
  expect(p).toEqual({ kind: 'running', step: 'split_plan', thenDone: true });
  p = transition(transition(p, { type: 'run_finished' }), { type: 'approve' });
  expect(p).toEqual({ kind: 'running', step: 'split', thenDone: true });
  expect(transition(p, { type: 'run_finished' })).toEqual({ kind: 'done' });
});

test('dropping the plan goes back to where the split was asked', () => {
  const plan: Phase = { kind: 'awaiting_approval', step: 'split_plan' };
  expect(transition(plan, { type: 'drop_split' })).toEqual(atReview);
  expect(transition({ ...plan, thenDone: true }, { type: 'drop_split' })).toEqual({ kind: 'done' });
});

test('a failed split is retried, still going back to done', () => {
  const failed = transition(
    { kind: 'running', step: 'split', thenDone: true },
    { type: 'run_failed', error: 'tree changed' },
  );
  expect(failed).toEqual({ kind: 'failed', step: 'split', error: 'tree changed', thenDone: true });
  expect(transition(failed, { type: 'retry' })).toEqual({
    kind: 'running',
    step: 'split',
    thenDone: true,
  });
});

test('a clean restack keeps the review; one an agent worked on runs the review again', () => {
  const p = transition(atReview, { type: 'restack' });
  expect(p).toEqual({ kind: 'running', step: 'restack', thenRun: 'final_review' });
  expect(transition(p, { type: 'rebased_clean' })).toEqual(atReview);
  expect(transition(p, { type: 'run_finished' })).toEqual({
    kind: 'running',
    step: 'final_review',
  });
  const fromDone = transition({ kind: 'done' }, { type: 'restack' });
  expect(fromDone).toEqual({
    kind: 'running',
    step: 'restack',
    thenRun: 'final_review',
    thenDone: true,
  });
  expect(transition(fromDone, { type: 'rebased_clean' })).toEqual({ kind: 'done' });
});

test('a failed restack retried still chains into the review', () => {
  const failed: Phase = { kind: 'failed', step: 'restack', error: 'conflict', thenDone: true };
  expect(transition(failed, { type: 'retry' })).toEqual({
    kind: 'running',
    step: 'restack',
    thenRun: 'final_review',
    thenDone: true,
  });
});

test('stack actions are refused before the final review and while a run is in flight', () => {
  const planning: Phase = { kind: 'awaiting_approval', step: 'technical' };
  expect(() => transition(planning, { type: 'split' })).toThrow(InvalidTransition);
  expect(() => transition({ kind: 'backlog' }, { type: 'restack' })).toThrow(InvalidTransition);
  expect(() => transition({ kind: 'running', step: 'implement' }, { type: 'split' })).toThrow(
    InvalidTransition,
  );
  expect(() => transition(atReview, { type: 'drop_split' })).toThrow(InvalidTransition);
  const plan: Phase = { kind: 'awaiting_approval', step: 'split_plan' };
  expect(() => transition(plan, { type: 'rebase' })).toThrow(InvalidTransition);
});

test('the plan can be cancelled like any step, and stack steps sit In review', () => {
  const plan: Phase = { kind: 'awaiting_approval', step: 'split_plan' };
  expect(transition(plan, { type: 'cancel' })).toEqual({ kind: 'cancelled' });
  expect(boardStatus(plan)).toBe('in_review');
  expect(boardStatus({ kind: 'running', step: 'split' })).toBe('in_review');
  expect(boardStatus({ kind: 'failed', step: 'restack', error: 'x' })).toBe('in_review');
});

test('a restack the worker starts after a merge is host only; a retry is the user asking', () => {
  const p = transition({ kind: 'done' }, { type: 'restack', hostOnly: true });
  expect(p).toEqual({
    kind: 'running',
    step: 'restack',
    thenRun: 'final_review',
    thenDone: true,
    hostOnly: true,
  });
  const failed = transition(p, { type: 'run_failed', error: 'conflict' });
  expect(transition(failed, { type: 'retry' })).toEqual({
    kind: 'running',
    step: 'restack',
    thenRun: 'final_review',
    thenDone: true,
  });
});

test('Restack after a failed restack runs it again as the user asked: the agent may resolve it', () => {
  const failed: Phase = { kind: 'failed', step: 'restack', error: 'conflict', thenDone: true };
  expect(transition(failed, { type: 'restack' })).toEqual({
    kind: 'running',
    step: 'restack',
    thenRun: 'final_review',
    thenDone: true,
  });
  const otherFailure: Phase = { kind: 'failed', step: 'implement', error: 'x' };
  expect(() => transition(otherFailure, { type: 'restack' })).toThrow(InvalidTransition);
});
