import { getTicket, schema, ticketBase, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import { install, type ImplementDeps } from './implement-checks';
import { ensureTicketContainer } from './provision';
import { runRebaseAgent, type Pushed, type Rebase } from './rebase-agent';
import { fetchIntoContainer } from './rebase-fetch';
import { contains, headCommit, restoreBranch } from './rebase-git';
import {
  pausedRebase,
  pauseRebase,
  published,
  remoteOf,
  resumeRebase,
  verifyAndPush,
} from './rebase-publish';
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

/** Fetch, safety check, agent, checks, push. A result here means the branch was not pushed. */
async function attempt(rebase: Rebase): Promise<StepResult | Pushed> {
  const { deps, container, branch, base } = rebase;
  const remote = await remoteOf(deps, rebase.project);
  const pushed = await fetchIntoContainer(deps.runtime, container, remote, { base, branch });
  if (!(await contains(deps.runtime, container, 'HEAD', `origin/${branch}`))) {
    return {
      kind: 'error',
      error: `\`${branch}\` on GitHub has commits this ticket's workspace does not: rebasing would drop them.`,
    };
  }
  const installError = await install(rebase);
  if (installError) {
    return { kind: 'error', error: installError };
  }
  const outcome = await runRebaseAgent(rebase);
  if (outcome.kind === 'rate_limited') {
    return { kind: 'rate_limited', retryAt: null };
  }
  if (outcome.kind === 'error') {
    return { kind: 'error', error: outcome.message };
  }
  const checked = await verifyAndPush(rebase, { pushed, outcome });
  if ('refused' in checked) {
    return pauseRebase(rebase, { refused: checked.refused, outcome, lease: pushed });
  }
  if ('error' in checked) {
    return { kind: 'error', error: `${checked.error}\n\nThe agent's report:\n\n${outcome.text}` };
  }
  return { pushed: true, outcome, gate: checked.gate };
}

/**
 * Rebases the ticket's branch onto its base with the implementer's own session, checks it and
 * force-pushes it with a lease. On any failure the branch is put back exactly as it was, unpushed.
 */
export async function runRebaseStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const prepared = await prepareBranch(deps, context);
  const refusal = context.resume ? pausedRebase(deps.db, context.ticket.id) : null;
  // A resumed rebase restores the branch as it was before the paused run, not the rebased one.
  const before = refusal?.resumeState.before ?? prepared.before;
  const rebase = { ...prepared, before };
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
    // Paused: the rebased branch and the refused changes stay for the user's decision.
    if (result.kind !== 'commit_refused') {
      await restore();
    }
    return result;
  } finally {
    await deps.runtime.stop(rebase.container);
  }
}
