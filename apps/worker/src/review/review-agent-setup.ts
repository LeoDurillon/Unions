// Prepares a review agent's checkout before it runs: the project's files and its install command, never for a fork's pull request.

import { schema, type ReviewAgentRun } from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentFn } from '../agent/agent';
import { runInstall } from '../gate';
import { syncProjectFiles } from '../project-files-sync';
import type { AgentReviewDeps } from './agent-review';
import { loadProject, type ReviewTarget } from './agent-review-target';
import { sideReviewContainer } from './names';
import type { CheckoutSetup } from './review-agent-prompt';

export type Deps = AgentReviewDeps & { agent?: AgentFn };

function fromFork(deps: Deps, run: ReviewAgentRun): boolean {
  if (run.reviewId === null) {
    return false;
  }
  const review = deps.db
    .select({ fromFork: schema.currentReviews.fromFork })
    .from(schema.currentReviews)
    .where(eq(schema.currentReviews.id, run.reviewId))
    .get();
  return review?.fromFork ?? false;
}

/** The project's files, then its install command; a fork's code is never run. */
export async function prepare(
  deps: Deps,
  run: ReviewAgentRun,
  target: ReviewTarget,
  signal: AbortSignal,
): Promise<CheckoutSetup> {
  if (fromFork(deps, run)) {
    return { kind: 'fork' };
  }
  const names = sideReviewContainer('v', run.id);
  await syncProjectFiles(deps.db, deps.runtime, target.projectId, {
    volume: names.workspaceVolume,
    image: deps.config.image,
  });
  const command = loadProject(deps.db, target.projectId).config.installCommand;
  if (!command) {
    return { kind: 'no_install' };
  }
  const error = await runInstall(deps.runtime, target.container, command, signal);
  return error === null ? { kind: 'installed', command } : { kind: 'install_failed', error };
}
