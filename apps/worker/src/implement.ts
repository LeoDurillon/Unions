import { schema, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import { branchName } from './branch';
import { captureDiff } from './diff-snapshot';
import { implementLoop, install, type ImplementDeps, type Workspace } from './implement-loop';
import { renderImplementReport } from './implement-prompts';
import { ensureTicketContainer } from './provision';
import { publishBranch } from './publish';
import type { StepContext, StepResult } from './scheduler';
import { commitsAhead, ensureBranch } from './workspace-git';

export { IMPLEMENT_DENIED, IMPLEMENT_TOOLS, type ImplementDeps } from './implement-loop';

function loadProject(db: Db, projectId: number): Project {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  return project;
}

async function prepare(
  deps: ImplementDeps,
  context: StepContext,
): Promise<Workspace & { branch: string }> {
  const project = loadProject(deps.db, context.ticket.projectId);
  const { name } = await ensureTicketContainer(deps.db, deps.runtime, deps.config, context.ticket);
  const branch = context.ticket.branch ?? branchName(context.ticket);
  deps.db
    .update(schema.tickets)
    .set({ branch })
    .where(eq(schema.tickets.id, context.ticket.id))
    .run();
  await ensureBranch(deps.runtime, name, branch, project.config.baseBranch);
  return { deps, context, project, container: name, branch };
}

/** Implements the approved plan on the ticket's branch, checks it, pushes it, opens the draft PR. */
export async function runImplementStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const workspace = await prepare(deps, context);
  const { project, container, branch } = workspace;
  try {
    const installError = await install(workspace);
    if (installError) {
      return { kind: 'error', error: installError };
    }
    const loop = await implementLoop(workspace);
    if (loop.outcome.kind === 'rate_limited') {
      return { kind: 'rate_limited', retryAt: null };
    }
    if (loop.outcome.kind === 'error') {
      return { kind: 'error', error: loop.outcome.message };
    }
    const base = project.config.baseBranch;
    await captureDiff(deps.db, deps.runtime, {
      container,
      ticketId: context.ticket.id,
      base,
    }).catch((error: unknown) => {
      context.log({ type: 'union_diff_failed', error: String(error) });
    });
    const publish = await publishBranch({
      ...deps,
      github: deps.github(project),
      project,
      ticket: context.ticket,
      container,
      branch,
    });
    const output = renderImplementReport({
      agentReport: loop.outcome.text,
      gateCommand: project.config.gateCommand,
      gate: loop.gate,
      iterations: loop.iterations,
      branch,
      ahead: await commitsAhead(deps.runtime, container, base, branch),
      base,
      publish,
    });
    return { kind: 'ok', output, sessionId: loop.outcome.sessionId };
  } finally {
    await deps.runtime.stop(container);
  }
}
