import { expect, test } from 'bun:test';

import { boardStatus, InvalidTransition, transition, type Phase } from './states';

test('a change of target runs like a rebase: from the review or done, clean or not', () => {
  const retargeting: Phase = { kind: 'running', step: 'retarget', thenRun: 'final_review' };
  const review: Phase = { kind: 'awaiting_approval', step: 'final_review' };
  expect(transition(review, { type: 'retarget' })).toEqual(retargeting);
  const fromDone = transition({ kind: 'done' }, { type: 'retarget' });
  expect(fromDone).toEqual({ ...retargeting, thenDone: true });
  expect(transition(retargeting, { type: 'rebased_clean' })).toEqual(review);
  expect(transition(fromDone, { type: 'rebased_clean' })).toEqual({ kind: 'done' });
  expect(transition(fromDone, { type: 'run_finished' })).toEqual({
    kind: 'running',
    step: 'final_review',
  });
  const failed = transition(fromDone, { type: 'run_failed', error: 'conflict' });
  expect(transition(failed, { type: 'retry' })).toEqual(fromDone);
  expect(boardStatus(fromDone)).toBe('in_review');
  for (const phase of [
    { kind: 'awaiting_approval', step: 'implement' },
    { kind: 'backlog' },
    { kind: 'cancelled' },
  ] satisfies Phase[]) {
    expect(() => transition(phase, { type: 'retarget' })).toThrow(InvalidTransition);
  }
});
