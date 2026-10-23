// Puts the repository on `branch`: the local branch if it exists, else the pushed one (a recreated
// container only has `origin/<branch>`), else a new branch from `base`.
import type { ContainerRuntime } from '@union/core';

import { mustRunIn, runIn } from './container-exec';
import { REPO_DIR } from './provision';

const AUTHOR_NAME = 'union agent';
const AUTHOR_EMAIL = 'union-agent@localhost';
const BUNDLE_PATH = '/tmp/union-branch.bundle';

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

export async function refExists(
  runtime: ContainerRuntime,
  container: string,
  ref: string,
): Promise<boolean> {
  const result = await runIn(runtime, container, git(['rev-parse', '--verify', '--quiet', ref]));
  return result.exitCode === 0;
}

/**
 * Puts the repository on `branch`: the local branch if it exists, else the pushed one (a recreated
 * container only has `origin/<branch>`), else a new branch from `base`. Also sets the commit identity.
 */
export async function ensureBranch(
  runtime: ContainerRuntime,
  container: string,
  branch: string,
  base: string,
): Promise<void> {
  await mustRunIn(runtime, container, git(['config', 'user.name', AUTHOR_NAME]));
  await mustRunIn(runtime, container, git(['config', 'user.email', AUTHOR_EMAIL]));
  if (await refExists(runtime, container, `refs/heads/${branch}`)) {
    await mustRunIn(runtime, container, git(['checkout', branch]));
    return;
  }
  const pushed = await refExists(runtime, container, `refs/remotes/origin/${branch}`);
  await mustRunIn(
    runtime,
    container,
    git(['checkout', '-b', branch, pushed ? `origin/${branch}` : base]),
  );
}

export async function commitsAhead(
  runtime: ContainerRuntime,
  container: string,
  base: string,
  branch: string,
): Promise<number> {
  const count = await mustRunIn(
    runtime,
    container,
    git(['rev-list', '--count', `${base}..${branch}`]),
  );
  return Number(count.trim());
}

/** Writes the branch to a git bundle inside the container and copies it to `hostPath`. */
export async function exportBranch(
  runtime: ContainerRuntime,
  container: string,
  branch: string | readonly string[],
  hostPath: string,
): Promise<void> {
  const branches = typeof branch === 'string' ? [branch] : branch;
  await mustRunIn(
    runtime,
    container,
    git(['bundle', 'create', BUNDLE_PATH, ...branches.map((name) => `refs/heads/${name}`)]),
  );
  await runtime.copyOut(container, BUNDLE_PATH, hostPath);
  await runIn(runtime, container, ['rm', '-f', BUNDLE_PATH]);
}

/** The commit checked out in the repository. */
export async function headCommit(runtime: ContainerRuntime, container: string): Promise<string> {
  const head = await mustRunIn(runtime, container, git(['rev-parse', 'HEAD']));
  return head.trim();
}

/** Whether `commit` is in HEAD's history (false once a rebase rewrote it, or when it is gone). */
export async function inHistory(
  runtime: ContainerRuntime,
  container: string,
  commit: string,
): Promise<boolean> {
  const result = await runIn(
    runtime,
    container,
    git(['merge-base', '--is-ancestor', commit, 'HEAD']),
  );
  return result.exitCode === 0;
}
