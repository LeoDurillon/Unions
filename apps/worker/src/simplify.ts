// Rewrites the ticket's commits into a simpler history with the implementer's own session, checks the code did not change and force-pushes it with a lease.
import type { ImplementDeps } from './implement-checks';
import { prepareBranch } from './rebase';
import type { Rebase } from './rebase-agent';
import { fetchIntoContainer } from './rebase-fetch';
import { contains, restoreBranch } from './rebase-git';
import { remoteOf } from './rebase-publish';
import { pendingRefusal } from './refused-commit';
import type { StepContext, StepResult } from './scheduler';
import { finishSimplify, resumeSimplify, runSimplifyAgent } from './simplify-finish';
import { historyOf } from './simplify-git';

/** Fetch, safety check, agent, then its leftovers, the checks on the result and the push. */
async function attempt(rebase: Rebase): Promise<StepResult> {
  const { deps, container, branch, base } = rebase;
  const remote = await remoteOf(deps, rebase.project);
  const lease = await fetchIntoContainer(deps.runtime, container, remote, { base, branch });
  if (!(await contains(deps.runtime, container, 'HEAD', `origin/${branch}`))) {
    return {
      kind: 'error',
      error: `\`${branch}\` on GitHub has commits this ticket's workspace does not: rewriting would drop them.`,
    };
  }
  const start = await historyOf(deps.runtime, container, { base });
  const outcome = await runSimplifyAgent(rebase, start);
  if (outcome.kind !== 'ok') {
    return outcome.kind === 'rate_limited'
      ? { kind: 'rate_limited', retryAt: null }
      : { kind: 'error', error: outcome.message };
  }
  return finishSimplify(rebase, { lease, start, outcome });
}

/**
 * Rewrites the ticket's branch into a simpler history, the code unchanged, with the implementer's
 * own session, and force-pushes it with a lease. A commit a hook refuses pauses it for the user;
 * any failure puts the branch back as it was.
 */
export async function runSimplifyStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const prepared = await prepareBranch(deps, context);
  const refusal = context.resume ? pendingRefusal(deps.db, context.ticket.id, 'simplify') : null;
  // A resumed run puts back the branch as it was before the paused run, not the rewritten one.
  const rebase = { ...prepared, before: refusal?.resumeState.before ?? prepared.before };
  const restore = (): Promise<void> =>
    restoreBranch(deps.runtime, rebase.container, rebase.branch, rebase.before);
  try {
    const result = await (refusal ? resumeSimplify(rebase, refusal) : attempt(rebase)).catch(
      async (error: unknown) => {
        await restore();
        throw error;
      },
    );
    // Paused: the new commits and the refused changes stay for the user's decision.
    if (result.kind !== 'ok' && result.kind !== 'commit_refused') {
      await restore();
    }
    return result;
  } finally {
    await deps.runtime.stop(rebase.container);
  }
}
