// Tests what each step is denied on top of every run's rules: the branch is the worker's, a rebase may rebase, a split may reset.
import { expect, test } from 'bun:test';

import { deniedFor, IMPLEMENT_DENIED } from './agent-denied';

test('the implementer may not move or rewrite the branch', () => {
  expect(deniedFor('implement')).toEqual(IMPLEMENT_DENIED);
});

test('a rebase may rebase and merge, nothing else of the implementer’s denials goes', () => {
  expect(deniedFor('rebase')).not.toContain('Bash(git rebase*)');
  expect(deniedFor('restack')).not.toContain('Bash(git merge*)');
  expect(deniedFor('retarget')).toContain('Bash(git checkout*)');
});

test('simplify and split may rebase and reset, but not check out', () => {
  expect(deniedFor('split')).toEqual(deniedFor('simplify'));
  expect(deniedFor('simplify')).not.toContain('Bash(git reset*)');
  expect(deniedFor('simplify')).toContain('Bash(git checkout*)');
});

test('planning and review steps are denied nothing more', () => {
  expect(deniedFor('technical')).toEqual([]);
  expect(deniedFor('final_review')).toEqual([]);
});
