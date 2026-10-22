import { getTicket, schema, ticketBase, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import type { ImplementDeps } from './implement-checks';
import { ensureTicketContainer } from './provision';
import type { Rebase } from './rebase-agent';
import { attempt } from './rebase-attempt';
import { headCommit, restoreBranch } from './rebase-git';
import { pausedRebase, published, resumeRebase } from './rebase-publish';
import type { StepContext, StepResult } from './scheduler';
import { ensureBranch } from './workspace-git';

function loadProject(db: Db, projectId: number): Project {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  return project;
}

/** The ticket's container on its branch, and the commit to put back if the run fails. */
export async function prepareBranch(deps: ImplementDeps, context: StepContext): Promise<Rebase> {
  const project = loadProject(deps.db, context.ticket.projectId);
  const { name } = await ensureTicketContainer(deps.db, deps.runtime, deps.config, context.ticket);
  const ticket = getTicket(deps.db, context.ticket.id);
  if (!ticket.branch) {
    throw new Error('The ticket has no branch yet');
  }
  const base = ticketBase(project, ticket);
  await ensureBranch(deps.runtime, name, ticket.branch, base);
  const before = await headCommit(deps.runtime, name);
  return {
    deps,
    context: { ...context, ticket },
    project,
    container: name,
    branch: ticket.branch,
    base,
    before,
  };
}

/** A restack, or a change of target onto `to`; neither: a plain rebase onto the ticket's base. */
export type RebaseOptions = {
  restack?: Rebase['restack'];
  retarget?: { from: string; to: string };
};

function withOptions(prepared: Rebase, options: RebaseOptions): Rebase {
  const { restack, retarget } = options;
  return {
    ...prepared,
    ...(restack ? { restack } : {}),
    ...(retarget ? { base: retarget.to, retarget: { from: retarget.from } } : {}),
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
  const step = options.retarget ? 'retarget' : 'rebase';
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
