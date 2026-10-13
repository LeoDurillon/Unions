import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ContainerRuntime } from '@union/core';

import { hostGit, REPO_DIR, type CloneSource } from './provision';

const SHORT_SHA = 7;

/**
 * The host clones the base branch, fetches the pull request (forks included, through its
 * `pull/<n>/head` ref) and checks out the commit its files were read at; the container only receives
 * the files, with a token-free `origin`. `origin/<base>` stays for the diff.
 */
export async function clonePullRequest(
  runtime: ContainerRuntime,
  container: string,
  source: CloneSource,
  pr: { base: string; number: number; headSha: string },
): Promise<void> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'union-pr-'));
  try {
    await hostGit(['clone', '--quiet', '--branch', pr.base, source.url, tmp], source.secret);
    await hostGit(
      ['-C', tmp, 'fetch', '--quiet', 'origin', `pull/${pr.number}/head`],
      source.secret,
    );
    try {
      await hostGit(['-C', tmp, 'checkout', '--quiet', '--detach', pr.headSha], source.secret);
    } catch {
      throw new Error(
        `#${pr.number} no longer holds ${pr.headSha.slice(0, SHORT_SHA)}: open its review again to read its latest files`,
      );
    }
    await hostGit(['-C', tmp, 'remote', 'set-url', 'origin', source.publicUrl], source.secret);
    await runtime.copyIn(container, tmp, REPO_DIR);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
