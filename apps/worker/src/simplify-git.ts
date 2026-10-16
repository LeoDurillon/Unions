// The branch's history since it left its base, and why a rewritten one cannot be pushed.
import type { ContainerRuntime } from '@union/core';

import { mustRunIn, runIn } from './container-exec';
import { REPO_DIR } from './provision';
import { branchProblem } from './rebase-git';

const SHORT_SHA = 7;

/** Where the branch left its base, the content it ends with, and how many commits lead there. */
export type History = { fork: string; tree: string; commits: number };

async function git(runtime: ContainerRuntime, container: string, args: string[]): Promise<string> {
  const output = await mustRunIn(runtime, container, ['git', '-C', REPO_DIR, ...args]);
  return output.trim();
}

/** The history of `ref` (the branch as it is now by default), against `origin/<base>`. */
export async function historyOf(
  runtime: ContainerRuntime,
  container: string,
  { base, ref = 'HEAD' }: { base: string; ref?: string },
): Promise<History> {
  const fork = await git(runtime, container, ['merge-base', ref, `origin/${base}`]);
  const tree = await git(runtime, container, ['rev-parse', `${ref}^{tree}`]);
  const commits = Number(await git(runtime, container, ['rev-list', '--count', `${fork}..${ref}`]));
  return { fork, tree, commits };
}

/**
 * Why the rewritten history cannot be pushed, or null when it can: on the branch, nothing left
 * uncommitted, still leaving the base where it did, and the same content at the end.
 */
export async function simplifyProblem(
  runtime: ContainerRuntime,
  container: string,
  input: { branch: string; base: string; start: History },
): Promise<string | null> {
  const { branch, base, start } = input;
  const problem = await branchProblem(runtime, container, branch);
  if (problem) {
    return problem;
  }
  const dirty = await runIn(runtime, container, ['git', '-C', REPO_DIR, 'diff', '--quiet', 'HEAD']);
  if (dirty.exitCode !== 0) {
    return 'Changes were left uncommitted: the new commits must hold all of the branch.';
  }
  const now = await historyOf(runtime, container, { base });
  if (now.fork !== start.fork) {
    return `The branch no longer leaves \`${base}\` at ${start.fork.slice(0, SHORT_SHA)}: moving it is a rebase.`;
  }
  if (now.tree !== start.tree) {
    return "The branch's content changed: a simplified history must end with exactly the same files.";
  }
  return null;
}
