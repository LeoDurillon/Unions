// Pushes every branch of a stack in one atomic push, each leased on what GitHub had: all or none.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ContainerRuntime } from '@union/core';

import { hostGit, type CloneSource } from './provision';
import { assertNoPrivateFiles, type PrivateFile } from './publish';
import { exportBranch } from './workspace-git';

/** A branch to push and the commit GitHub must still have it on; null: it must not exist yet. */
export type StackBranch = { branch: string; lease: string | null };

/**
 * Takes the branches out of the container as one bundle and pushes them from the host with
 * `--atomic`: a branch someone moved meanwhile refuses the whole push, so the stack never ends up
 * half pushed.
 */
export async function pushStack(
  runtime: ContainerRuntime,
  container: string,
  remote: CloneSource,
  target: { branches: readonly StackBranch[]; privateFiles: PrivateFile[] },
): Promise<void> {
  const names = target.branches.map((entry) => entry.branch);
  const dir = await mkdtemp(path.join(tmpdir(), 'union-stack-push-'));
  try {
    const bundle = path.join(dir, 'stack.bundle');
    const bare = path.join(dir, 'repo.git');
    await exportBranch(runtime, container, names, bundle);
    await hostGit(['init', '--quiet', '--bare', bare], null);
    const refs = names.map((name) => `refs/heads/${name}:refs/heads/${name}`);
    await hostGit(['-C', bare, 'fetch', '--quiet', bundle, ...refs], null);
    await assertNoPrivateFiles(bare, target.privateFiles);
    const leases = target.branches.map(
      (entry) => `--force-with-lease=refs/heads/${entry.branch}:${entry.lease ?? ''}`,
    );
    await hostGit(
      ['-C', bare, 'push', '--quiet', '--atomic', ...leases, remote.url, ...refs],
      remote.secret,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
