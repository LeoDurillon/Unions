import type { ContainerRuntime } from '@union/core';

import { mustRunIn, runIn } from './container-exec';
import { REPO_DIR } from './provision';

const AUTHOR_NAME = 'union agent';
const AUTHOR_EMAIL = 'union-agent@localhost';
const BUNDLE_PATH = '/tmp/union-branch.bundle';

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

async function refExists(
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

/** Files the agent changed but did not commit. */
export async function uncommittedFiles(
  runtime: ContainerRuntime,
  container: string,
): Promise<string[]> {
  const status = await mustRunIn(runtime, container, git(['status', '--porcelain']));
  return status.split('\n').filter((line) => line.trim() !== '');
}

/** Commits whatever the agent left uncommitted, so the push contains everything it did. */
export async function commitLeftovers(
  runtime: ContainerRuntime,
  container: string,
): Promise<boolean> {
  const leftovers = await uncommittedFiles(runtime, container);
  if (leftovers.length === 0) {
    return false;
  }
  await mustRunIn(runtime, container, git(['add', '-A']));
  await mustRunIn(
    runtime,
    container,
    git(['commit', '-m', 'chore: changes the agent left uncommitted']),
  );
  return true;
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
  branch: string,
  hostPath: string,
): Promise<void> {
  await mustRunIn(
    runtime,
    container,
    git(['bundle', 'create', BUNDLE_PATH, `refs/heads/${branch}`]),
  );
  await runtime.copyOut(container, BUNDLE_PATH, hostPath);
  await runIn(runtime, container, ['rm', '-f', BUNDLE_PATH]);
}
