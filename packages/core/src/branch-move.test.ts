// Tests telling how a ticket's branch moved on GitHub, and what that holds back until a resync.
import { expect, test } from 'bun:test';

import { movedBranchRefusal, moveKind, resyncRefusal } from './branch-move';
import type { BranchMove } from './schema-types';

const MOVED: BranchMove = { from: 'aaa', to: 'bbb', kind: 'diverged' };

test('commits on top are a move ahead, a rewrite diverges, the same head is no move', () => {
  expect(moveKind('ahead', false)).toBe('ahead');
  expect(moveKind('diverged', false)).toBe('diverged');
  expect(moveKind('identical', true)).toBeNull();
});

test('a head behind the push counts only once it stays: GitHub may not have caught up yet', () => {
  expect(moveKind('behind', false)).toBeNull();
  expect(moveKind('behind', true)).toBe('diverged');
});

test('a pushed commit GitHub no longer knows is a rewrite', () => {
  expect(moveKind(null, false)).toBe('diverged');
});

test('a moved branch holds back the actions that push it, not the others', () => {
  expect(movedBranchRefusal({ remoteMoved: MOVED }, 'rebase')).toContain('resync');
  expect(movedBranchRefusal({ remoteMoved: MOVED }, 'revise')).toContain('resync');
  expect(movedBranchRefusal({ remoteMoved: MOVED }, 'approve')).toBeNull();
  expect(movedBranchRefusal({ remoteMoved: null }, 'rebase')).toBeNull();
});

test('a resync needs a move, no step on the branch, and no stack', () => {
  const ticket = { remoteMoved: MOVED, phase: { kind: 'done' } as const, branch: 'feature' };
  expect(resyncRefusal(ticket, false)).toBeNull();
  expect(resyncRefusal({ ...ticket, remoteMoved: null }, false)).toContain('nothing to resync');
  expect(
    resyncRefusal({ ...ticket, phase: { kind: 'running', step: 'implement' } }, false),
  ).toContain('A step');
  expect(resyncRefusal(ticket, true)).toContain('split');
});
