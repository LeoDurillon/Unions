// A pull request's preview: its checkout made before a start, and moved to a newer reviewed commit on request.
import { getPreview, PREVIEW_REPO_DIR, updatePreview, type WorkspaceOwner } from '@union/core';

import type { TargetDeps } from '../agent-review-target';
import { ensureReviewCheckout, updateReviewCheckout } from '../review-checkout';
import { startPreview, takeDown, type PreviewDeps, type StartOutcome } from './run';
import { PreviewError } from './target';

function checkoutDeps(deps: PreviewDeps): TargetDeps {
  if (!deps.config) {
    throw new PreviewError('The worker cannot start containers here');
  }
  return { db: deps.db, runtime: deps.runtime, config: deps.config };
}

function failed(deps: PreviewDeps, owner: WorkspaceOwner, error: unknown): StartOutcome {
  const message = error instanceof Error ? error.message : String(error);
  updatePreview(deps.db, owner, { status: 'failed', error: message });
  return { ok: false, error: message, unavailable: true };
}

/** Starts the pull request's preview, checking it out in its own container the first time. */
export async function startReviewPreview(
  deps: PreviewDeps,
  reviewId: number,
): Promise<StartOutcome> {
  const owner = { reviewId };
  try {
    await ensureReviewCheckout(checkoutDeps(deps), reviewId);
  } catch (error) {
    return failed(deps, owner, error);
  }
  return startPreview(deps, owner);
}

/** Empties the checkout's folder as root: a service may have written files there as root. */
async function clearRepository(deps: PreviewDeps, workspaceVolume: string): Promise<void> {
  const lines = deps.runtime.runHelper({
    image: deps.settings.image,
    command: ['rm', '-rf', PREVIEW_REPO_DIR],
    mounts: [{ source: workspaceVolume, target: '/workspace' }],
  });
  const output: string[] = [];
  for (;;) {
    const next = await lines.next();
    if (next.done) {
      if (next.value.exitCode !== 0) {
        throw new Error(`Could not empty the checkout:\n${output.join('\n')}`);
      }
      return;
    }
    output.push(next.value);
  }
}

/**
 * Checks out the commit the review reads now, in place of the old one (what commands and services
 * wrote in the checkout goes). The preview is taken down first, its data with it, and started again
 * when it was running.
 */
export async function updateReviewPreview(deps: PreviewDeps, reviewId: number): Promise<void> {
  const owner = { reviewId };
  const running = getPreview(deps.db, owner)?.status === 'running';
  updatePreview(deps.db, owner, { status: 'stopping' });
  try {
    await takeDown(deps, owner);
    await updateReviewCheckout(checkoutDeps(deps), reviewId, (volume) =>
      clearRepository(deps, volume),
    );
  } catch (error) {
    failed(deps, owner, error);
    return;
  }
  if (running) {
    await startPreview(deps, owner);
  } else {
    updatePreview(deps.db, owner, { status: 'stopped', error: null });
  }
}
