// The git checks around a rebase: what a branch's history holds, what the agent left, and putting
// the branch back.
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

/** Where the branch, at `before`, left `origin/<from>`: the commits after it are its own. */
export async function forkPoint(
  runtime: ContainerRuntime,
  container: string,
  refs: { from: string; before: string },
): Promise<string> {
  const fork = await mustRunIn(
    runtime,
    container,
    git(['merge-base', refs.before, `origin/${refs.from}`]),
  );
  return fork.trim();
}

async function lines(
  runtime: ContainerRuntime,
  container: string,
  args: string[],
): Promise<string[]> {
  const out = await mustRunIn(runtime, container, git(args));
  return out.split('\n').filter((line) => line.trim() !== '');
}

const SHORT_SHA = 7;

/**
 * Why a change of target cannot be pushed: commits the old base has and the new one lacks came
 * along, as they were or rewritten (same patch); null when none, or for a plain rebase.
 */
export async function carriedOver(
  runtime: ContainerRuntime,
  container: string,
  rebase: { base: string; before: string; retarget?: { from: string } },
): Promise<string | null> {
  if (!rebase.retarget) {
    return null;
  }
  const { from } = rebase.retarget;
  const fork = await forkPoint(runtime, container, { from, before: rebase.before });
  const target = `origin/${rebase.base}`;
  const left = new Set(await lines(runtime, container, ['rev-list', fork, '--not', 'HEAD']));
  const oldOnly = await lines(runtime, container, ['rev-list', fork, '--not', target]);
  const kept = oldOnly.filter((sha) => !left.has(sha));
  // `-`: a commit of the branch with the same patch as one of the old base's.
  const cherry = await lines(runtime, container, ['cherry', fork, 'HEAD', target]);
  const rewritten = cherry.filter((line) => line.startsWith('- ')).map((line) => line.slice(2));
  const carried = [...kept, ...rewritten];
  if (carried.length === 0) {
    return null;
  }
  const shas = carried.map((sha) => sha.slice(0, SHORT_SHA)).join(', ');
  return `Commits of \`${from}\` that \`${rebase.base}\` lacks came along (${shas}): only the branch's own commits, after ${fork.slice(0, SHORT_SHA)}, may move.`;
}
