// The commands Union denies its agents, whatever their tools or the repository's settings: for every run, and per step.

import type { BuiltInStep, Step } from '../phases';
import { isCustomStep } from '../states';

/** Denied to every agent run: no pushing, no remotes, no GitHub CLI, no network fetch. */
export const BASE_DENIED = [
  'Bash(git push*)',
  'Bash(git remote*)',
  'Bash(gh *)',
  'Bash(curl *)',
] as const;

/** Runs that work on the ticket's branch: the worker owns the branch and its history. */
export const IMPLEMENT_DENIED = [
  'Bash(git checkout*)',
  'Bash(git switch*)',
  'Bash(git rebase*)',
  'Bash(git reset*)',
  'Bash(git merge*)',
  'Bash(git worktree*)',
  'Bash(git branch -D*)',
] as const;

/** The implementer's denied rules, minus the ones a rebase needs (`git merge*` also covers `merge-base`). */
const REBASE_DENIED = IMPLEMENT_DENIED.filter(
  (rule) => rule !== 'Bash(git rebase*)' && rule !== 'Bash(git merge*)',
);

/** The implementer's denied rules, minus the history rewrites simplify and split are for. */
const SIMPLIFY_DENIED = IMPLEMENT_DENIED.filter(
  (rule) => rule !== 'Bash(git rebase*)' && rule !== 'Bash(git reset*)',
);

/** What each built-in step is denied on top of `BASE_DENIED`: a new step has to say. */
const DENIED_BY_STEP: Record<BuiltInStep, readonly string[]> = {
  intake: [],
  summary: [],
  technical: [],
  test_plan: [],
  split_plan: [],
  final_review: [],
  implement: IMPLEMENT_DENIED,
  rebase: REBASE_DENIED,
  retarget: REBASE_DENIED,
  restack: REBASE_DENIED,
  simplify: SIMPLIFY_DENIED,
  split: SIMPLIFY_DENIED,
};

/** What a run of `step` is denied on top of `BASE_DENIED`; a custom agent's step, nothing more. */
export function deniedFor(step: Step): readonly string[] {
  return isCustomStep(step) ? [] : DENIED_BY_STEP[step];
}
