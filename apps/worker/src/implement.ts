import { getTicket, schema, ticketBase, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import { branchName } from './branch';
import { captureDiff } from './diff-snapshot';
import { implementLoop, install, type ImplementDeps, type Workspace } from './implement-loop';
import { renderImplementReport } from './implement-prompts';
import { ensureTicketContainer } from './provision';
import { publishBranch } from './publish';
import type { StepContext, StepResult } from './scheduler';
import { commitsAhead, ensureBranch } from './workspace-git';

export { IMPLEMENT_DENIED, type ImplementDeps } from './implement-loop';

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
): Promise<Workspace & { branch: string; base: string }> {
  const project = loadProject(deps.db, context.ticket.projectId);
  const { name } = await ensureTicketContainer(deps.db, deps.runtime, deps.config, context.ticket);
  // Re-read: provisioning may have just chosen the base (the parent's branch).
  const ticket = getTicket(deps.db, context.ticket.id);
  const branch = ticket.branch ?? branchName(ticket);
  deps.db.update(schema.tickets).set({ branch }).where(eq(schema.tickets.id, ticket.id)).run();
  const base = ticketBase(project, ticket);
  await ensureBranch(deps.runtime, name, branch, base);
  return { deps, context: { ...context, ticket }, project, container: name, branch, base };
}

/** Implements the approved plan on the ticket's branch, checks it, pushes it, opens the draft PR. */
export async function runImplementStep(
  deps: ImplementDeps,
  context: StepContext,
): Promise<StepResult> {
  const workspace = await prepare(deps, context);
  const { project, container, branch, base } = workspace;
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
      ticket: workspace.context.ticket,
      container,
      branch,
      base,
      describer: {
        db: deps.db,
        agent: deps.agent,
        sessionId: loop.outcome.sessionId,
        signal: context.signal,
        log: context.log,
      },
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
