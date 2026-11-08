// A review agent's change in its own throwaway container (`union-v<id>`): a pull request cloned from GitHub, a ticket's branch from a bundle of its container's.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getTicket, type ReviewAgentRun } from '@union/core';

import {
  loadProject,
  openTarget,
  throwawayCheckout,
  type ReviewTarget,
  type TargetDeps,
} from './agent-review-target';
import { hostGit, REPO_DIR, type TicketContainer } from './provision';
import { exportBranch } from './workspace-git';

/**
 * The host clones the ticket's branch and its base from a bundle of the ticket container's
 * repository (the base may be a parent's branch GitHub does not have), checks out the reviewed
 * commit and copies the files in, `origin` set to the token-free URL.
 */
async function copyTicketBranch(
  deps: TargetDeps,
  from: { container: string; branches: string[]; headSha: string },
  into: { container: string; publicUrl: string },
): Promise<void> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'union-review-agent-'));
  try {
    const bundle = path.join(tmp, 'branch.bundle');
    const repo = path.join(tmp, 'repo');
    await exportBranch(deps.runtime, from.container, from.branches, bundle);
    await hostGit(['clone', '--quiet', '--no-checkout', bundle, repo], null);
    // Local branches as the ticket's container has them: its diff base is a branch name.
    await hostGit(
      ['-C', repo, 'fetch', '--quiet', '--update-head-ok', 'origin', '+refs/heads/*:refs/heads/*'],
      null,
    );
    await hostGit(['-C', repo, 'checkout', '--quiet', '--detach', from.headSha], null);
    await hostGit(['-C', repo, 'remote', 'set-url', 'origin', into.publicUrl], null);
    await deps.runtime.copyIn(into.container, repo, REPO_DIR);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** The ticket's change, read in its own container, then copied into `names`'s. */
async function ticketCopy(
  deps: TargetDeps,
  ticketId: number,
  names: TicketContainer,
): Promise<ReviewTarget> {
  const own = await openTarget(deps, { id: 0, ticketId, reviewId: null }, names);
  try {
    const { branch } = getTicket(deps.db, ticketId);
    const branches = [...new Set([branch ?? '', own.base])].filter((name) => name !== '');
    const project = loadProject(deps.db, own.projectId);
    const close = await throwawayCheckout(deps, project, names, (source) =>
      copyTicketBranch(
        deps,
        { container: own.container, branches, headSha: own.headSha },
        { container: names.name, publicUrl: source.publicUrl },
      ),
    );
    return { ...own, container: names.name, close };
  } finally {
    await own.close();
  }
}

/**
 * Checks the run's change out in its own throwaway container (`union-v<id>`), even for a ticket: a
 * review agent may build and test, which nothing keeps. The target's `close` removes it.
 */
export function openReviewAgentTarget(
  deps: TargetDeps,
  run: Pick<ReviewAgentRun, 'id' | 'ticketId' | 'reviewId'>,
  names: TicketContainer,
): Promise<ReviewTarget> {
  return run.ticketId === null
    ? openTarget(deps, run, names)
    : ticketCopy(deps, run.ticketId, names);
}
