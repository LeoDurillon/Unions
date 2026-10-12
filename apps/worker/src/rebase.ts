import { getTicket, schema, ticketBase, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import { install, type ImplementDeps } from './implement-loop';
import { ensureTicketContainer } from './provision';
import { runRebaseAgent, type Pushed, type Rebase } from './rebase-agent';
import { fetchIntoContainer } from './rebase-fetch';
import { contains, headCommit, restoreBranch } from './rebase-git';
import { published, remoteOf, verifyAndPush } from './rebase-publish';
import type { StepContext, StepResult } from './scheduler';
import { ensureBranch } from './workspace-git';

function loadProject(db: Db, projectId: number): Project {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  return project;
}

async function prepare(deps: ImplementDeps, context: StepContext): Promise<Rebase> {
  const project = loadProject(deps.db, context.ticket.projectId);
  const { name } = await ensureTicketContainer(deps.db, deps.runtime, deps.config, context.ticket);
  const ticket = getTicket(deps.db, context.ticket.id);
  if (!ticket.branch) {
    throw new Error('The ticket has no branch to rebase yet');
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
  const checked = await verifyAndPush(rebase, pushed);
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
  const rebase = await prepare(deps, context);
  const restore = (): Promise<void> =>
    restoreBranch(deps.runtime, rebase.container, rebase.branch, rebase.before);
  try {
    const result = await attempt(rebase).catch(async (error: unknown) => {
      await restore();
      throw error;
    });
    if ('pushed' in result) {
      return await published(rebase, result);
    }
    await restore();
    return result;
  } finally {
    await deps.runtime.stop(rebase.container);
  }
}
