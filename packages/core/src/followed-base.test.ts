import { describe, expect, test } from 'bun:test';

import { baseToFollow } from './followed-base';
import type { Ticket } from './tickets';

const done: Pick<Ticket, 'phase' | 'baseBranch' | 'prState'> = {
  phase: { kind: 'done' },
  baseBranch: 'feature/parent',
  prState: 'open',
};
const pull = { base: 'develop', projectBase: 'main', split: false };

describe('baseToFollow', () => {
  test('follows the base GitHub moved the pull request onto', () => {
    expect(baseToFollow(done, pull)).toEqual({ from: 'feature/parent', to: 'develop' });
  });

  test('a ticket on the project base compares with it', () => {
    expect(baseToFollow({ ...done, baseBranch: null }, pull)).toEqual({
      from: 'main',
      to: 'develop',
    });
    expect(baseToFollow({ ...done, baseBranch: null }, { ...pull, base: 'main' })).toBeNull();
  });

  test('nothing when the base is the same, unknown, or the pull request not open', () => {
    expect(baseToFollow(done, { ...pull, base: 'feature/parent' })).toBeNull();
    expect(baseToFollow(done, { ...pull, base: undefined })).toBeNull();
    expect(baseToFollow({ ...done, prState: 'merged' }, pull)).toBeNull();
  });

  test('waits while a step runs or is paused', () => {
    const running = { ...done, phase: { kind: 'running', step: 'implement' } as const };
    const refused = { ...done, phase: { kind: 'commit_refused', step: 'rebase' } as const };
    expect(baseToFollow(running, pull)).toBeNull();
    expect(baseToFollow(refused, pull)).toBeNull();
  });

  test('follows at the final review and after a failed rebase', () => {
    const review = { ...done, phase: { kind: 'awaiting_approval', step: 'final_review' } as const };
    const failed = { ...done, phase: { kind: 'failed', step: 'rebase', error: 'x' } as const };
    expect(baseToFollow(review, pull)).not.toBeNull();
    expect(baseToFollow(failed, pull)).not.toBeNull();
  });

  test('a split ticket follows through its stack instead', () => {
    expect(baseToFollow(done, { ...pull, split: true })).toBeNull();
  });
});
