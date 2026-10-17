import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ContainerRuntime } from '@union/core';

import { hostGit, REPO_DIR, type CloneSource } from './provision';

const SHORT_SHA = 7;

/** A pull request to check out, at the commit its files were read at. */
export type PullAt = { number: number; headSha: string };

/** Where a pull request's reviewed commit is kept in the checkout. */
export function pullRef(number: number): string {
  return `refs/union/pr-${number}`;
}

/**
 * The host clones the base branch, fetches each pull request (forks included, through its
 * `pull/<n>/head` ref), keeps the commit its files were read at as `refs/union/pr-<n>` and checks
 * out the last one; the container only receives the files, with a token-free `origin`.
 * `origin/<base>` stays for the diff.
 */
export async function clonePullRequests(
  runtime: ContainerRuntime,
  container: string,
  source: CloneSource,
  { base, pulls }: { base: string; pulls: PullAt[] },
): Promise<void> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'union-pr-'));
  try {
    await hostGit(['clone', '--quiet', '--branch', base, source.url, tmp], source.secret);
    for (const pr of pulls) {
      await hostGit(
        ['-C', tmp, 'fetch', '--quiet', 'origin', `pull/${pr.number}/head`],
        source.secret,
      );
      try {
        await hostGit(['-C', tmp, 'update-ref', pullRef(pr.number), pr.headSha], source.secret);
      } catch {
        throw new Error(
          `#${pr.number} no longer holds ${pr.headSha.slice(0, SHORT_SHA)}: open its review again to read its latest files`,
        );
      }
    }
    const top = pulls.at(-1);
    if (top) {
      await hostGit(['-C', tmp, 'checkout', '--quiet', '--detach', top.headSha], source.secret);
    }
    await hostGit(['-C', tmp, 'remote', 'set-url', 'origin', source.publicUrl], source.secret);
    await runtime.copyIn(container, tmp, REPO_DIR);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** One pull request, checked out at its reviewed commit. */
export function clonePullRequest(
  runtime: ContainerRuntime,
  container: string,
  source: CloneSource,
  pr: { base: string } & PullAt,
): Promise<void> {
  return clonePullRequests(runtime, container, source, { base: pr.base, pulls: [pr] });
}
