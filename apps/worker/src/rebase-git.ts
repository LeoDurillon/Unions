import type { ContainerRuntime } from '@union/core';

import { mustRunIn, runIn } from './container-exec';
import { REPO_DIR } from './provision';

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

async function succeeds(
  runtime: ContainerRuntime,
  container: string,
  args: string[],
): Promise<boolean> {
  const result = await runIn(runtime, container, git(args));
  return result.exitCode === 0;
}

export async function headCommit(runtime: ContainerRuntime, container: string): Promise<string> {
  const head = await mustRunIn(runtime, container, git(['rev-parse', 'HEAD']));
  return head.trim();
}

/** Whether `ancestor` is already part of `ref`'s history. */
export function contains(
  runtime: ContainerRuntime,
  container: string,
  ref: string,
  ancestor: string,
): Promise<boolean> {
  return succeeds(runtime, container, ['merge-base', '--is-ancestor', ancestor, ref]);
}

/** Why the agent left the repository unusable: a rebase half-done, or another branch checked out. */
export async function branchProblem(
  runtime: ContainerRuntime,
  container: string,
  branch: string,
): Promise<string | null> {
  const unfinished = await runIn(runtime, container, [
    'sh',
    '-c',
    `test -d ${REPO_DIR}/.git/rebase-merge || test -d ${REPO_DIR}/.git/rebase-apply`,
  ]);
  if (unfinished.exitCode === 0) {
    return 'The rebase was left unfinished.';
  }
  const current = await runIn(runtime, container, git(['symbolic-ref', '--short', 'HEAD']));
  return current.stdout.trim() === branch ? null : `The repository is no longer on \`${branch}\`.`;
}

/**
 * Why the agent's rebase cannot be pushed, or null when it can: no rebase left half-done, still on
 * the ticket's branch, and the base branch is now part of it.
 */
export async function rebaseProblem(
  runtime: ContainerRuntime,
  container: string,
  refs: { base: string; branch: string },
): Promise<string | null> {
  const problem = await branchProblem(runtime, container, refs.branch);
  if (problem) {
    return problem;
  }
  if (!(await contains(runtime, container, 'HEAD', `origin/${refs.base}`))) {
    return `The branch still does not contain \`origin/${refs.base}\`.`;
  }
  return null;
}

/** Puts the branch back exactly as it was before the rebase, whatever the agent left behind. */
export async function restoreBranch(
  runtime: ContainerRuntime,
  container: string,
  branch: string,
  commit: string,
): Promise<void> {
  await runIn(runtime, container, git(['rebase', '--abort']));
  await mustRunIn(runtime, container, git(['checkout', '--force', branch]));
  await mustRunIn(runtime, container, git(['reset', '--hard', commit]));
  await mustRunIn(runtime, container, git(['clean', '-fd']));
}

/** Why the stack cannot be pushed after a rebase: a slice's branch left behind; null when none. */
export async function stackMoveProblem(
  runtime: ContainerRuntime,
  container: string,
  input: { base: string; lower: readonly { branch: string }[] },
): Promise<string | null> {
  for (const slice of input.lower) {
    const onBase = await contains(runtime, container, slice.branch, `origin/${input.base}`);
    const inBranch = await contains(runtime, container, 'HEAD', slice.branch);
    if (!onBase || !inBranch) {
      return `\`${slice.branch}\` did not move with the branch: rebase with \`git rebase --update-refs origin/${input.base}\`.`;
    }
  }
  return null;
}
