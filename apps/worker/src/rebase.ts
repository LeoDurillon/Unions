// Rebases the ticket's branch onto its base (git alone when there is no conflict, else the
// implementer's own session), checks it and force-pushes it with a lease.
import type { ImplementDeps } from './implement-checks';
import { afterFollowed, followedMove } from './left-base';
import type { Rebase } from './rebase-agent';
import { attempt } from './rebase-attempt';
import { restoreBranch } from './rebase-git';
import { prepareBranch } from './rebase-prepare';
import { pausedRebase, published, resumeRebase } from './rebase-publish';
import type { StepContext, StepResult } from './scheduler';

/** A restack, or a change of target onto `to`; neither: a plain rebase onto the ticket's base. */
export type RebaseOptions = {
  restack?: Rebase['restack'];
  retarget?: { from: string; to: string; source: string | null };
};

function withOptions(prepared: Rebase, options: RebaseOptions): Rebase {
  const { restack, retarget } = options;
  return {
    ...prepared,
    ...(restack ? { restack } : {}),
    ...(retarget
      ? { base: retarget.to, retarget: { from: retarget.from, source: retarget.source } }
      : {}),
  };
}

/**
 * Rebases the ticket's branch onto its base (git alone when there is no conflict, else the
 * implementer's own session), checks it and force-pushes it with a lease. On any failure the branch
 * is put back exactly as it was, unpushed. `restack`: only the commits after a merged slice move;
 * `retarget`: only the branch's own commits move, onto another base.
 */
export async function runRebaseStep(
  deps: ImplementDeps,
  context: StepContext,
  options: RebaseOptions = {},
): Promise<StepResult> {
  const prepared = await prepareBranch(deps, context);
  // A rebase after GitHub moved the pull request off its base moves like a change of target.
  const plain = !options.retarget && !options.restack;
  if (plain && prepared.context.ticket.leftBase) {
    const move = await followedMove(prepared).catch(async (error: unknown) => {
      await deps.runtime.stop(prepared.container);
      throw error;
    });
    const rebase = move ? { ...prepared, retarget: move } : prepared;
    return afterFollowed(rebase, await runPrepared(rebase, options));
  }
  return runPrepared(prepared, options);
}

async function runPrepared(prepared: Rebase, options: RebaseOptions): Promise<StepResult> {
  const { deps, context } = prepared;
  const step = context.step === 'retarget' ? 'retarget' : 'rebase';
  const refusal = context.resume ? pausedRebase(deps.db, context.ticket.id, step) : null;
  // A resumed rebase restores the branch as it was before the paused run, not the rebased one.
  const before = refusal?.resumeState.before ?? prepared.before;
  const rebase = withOptions({ ...prepared, before }, options);
  const restore = (): Promise<void> =>
    restoreBranch(deps.runtime, rebase.container, rebase.branch, rebase.before);
  try {
    const result = await (refusal ? resumeRebase(rebase, refusal) : attempt(rebase)).catch(
      async (error: unknown) => {
        await restore();
        throw error;
      },
    );
    if ('pushed' in result) {
      return await published(rebase, result);
    }
    // Pushed by the host, or nothing to push: the branch is as GitHub has it.
    if (result.kind === 'ok') {
      return result;
    }
    // Paused: the rebased branch and the refused changes stay for the user's decision.
    if (result.kind !== 'commit_refused') {
      await restore();
    }
    return result;
  } finally {
    await deps.runtime.stop(rebase.container);
  }
}
