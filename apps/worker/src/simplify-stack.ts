// Simplifies a split ticket's history slice by slice with the implementer's session, each slice's content unchanged, and force-pushes the stack.
import { openSlices } from '@union/core';

import type { ImplementDeps } from './implement-checks';
import { prepareBranch, restorePrepared } from './rebase-prepare';
import type { StepContext, StepResult } from './scheduler';
import { simplifyStack } from './simplify-stack-run';
import { lowerSlices, syncLowerBranches } from './stack-refs';

/**
 * Rewrites each slice of the ticket's stack into a simpler history, every slice's tip with the same
 * content, and pushes the stack in one atomic push. A refused commit fails it like any problem:
 * the branch and the lower slices' branches are put back where they were last pushed.
 */
export async function runStackSimplifyStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const rebase = await prepareBranch(deps, context);
  const restore = async (): Promise<void> => {
    await restorePrepared(rebase);
    const lower = lowerSlices(deps.db, rebase.context.ticket.id);
    await syncLowerBranches(deps.runtime, rebase.container, lower);
  };
  try {
    const slices = openSlices(deps.db, rebase.context.ticket.id);
    const result = await simplifyStack(rebase, slices).catch(async (error: unknown) => {
      await restore();
      throw error;
    });
    if (result.kind !== 'ok') {
      await restore();
    }
    return result;
  } finally {
    await deps.runtime.stop(rebase.container);
  }
}
