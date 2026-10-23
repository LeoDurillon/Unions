// The implementation before it is published: the agent's turns and the checks, or the end of a run
// paused on a refused commit.
import { getTicket, schema, ticketBase, type Db, type Project } from '@union/core';
import { eq } from 'drizzle-orm';

import { branchName } from './branch';
import { runGate } from './gate';
import { install } from './implement-checks';
import { implementLoop, type ImplementDeps, type Loop, type Workspace } from './implement-loop';
import { ensureTicketContainer } from './provision';
import {
  outcomeOf,
  pauseOnRefusal,
  pendingRefusal,
  resolutionNote,
  resumeRefusal,
} from './refused-commit';
import type { StepContext, StepResult } from './scheduler';
import { ensureBranch } from './workspace-git';

export type Prepared = Workspace & { branch: string; base: string };
/** A finished agent loop to publish, with a note on the refused commit when the run was paused. */
export type Implemented = { loop: Loop & { outcome: { kind: 'ok' } }; note?: string };

function loadProject(db: Db, projectId: number): Project {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  return project;
}

export async function prepare(deps: ImplementDeps, context: StepContext): Promise<Prepared> {
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

/** The agent's turns and the checks; a result here ends the run before anything is published. */
export async function implement(workspace: Prepared): Promise<StepResult | Implemented> {
  const installError = await install(workspace);
  if (installError) {
    return { kind: 'error', error: installError };
  }
  const loop = await implementLoop(workspace);
  const { outcome } = loop;
  if (outcome.kind === 'rate_limited') {
    return { kind: 'rate_limited', retryAt: null };
  }
  if (outcome.kind === 'error') {
    return { kind: 'error', error: outcome.message };
  }
  if (loop.refused) {
    return pauseOnRefusal(workspace.deps.db, {
      ticketId: workspace.context.ticket.id,
      step: 'implement',
      refused: loop.refused,
      report: outcome.text,
      sessionId: outcome.sessionId,
      resumeState: { iterations: loop.iterations },
    });
  }
  return { loop: { ...loop, outcome } };
}

/** Finishes a run paused on a refused commit: applies the user's decision, then runs the checks. */
export async function resume(workspace: Prepared): Promise<StepResult | Implemented> {
  const { deps, context, project, container } = workspace;
  const refusal = pendingRefusal(deps.db, context.ticket.id, 'implement');
  const paused = await resumeRefusal(deps, container, refusal);
  if (paused) {
    return paused;
  }
  const { gateCommand } = project.config;
  await deps.services?.ensure();
  const gate = gateCommand
    ? await runGate(deps.runtime, container, gateCommand, context.signal)
    : null;
  const iterations = refusal.resumeState.iterations ?? 1;
  return { loop: { outcome: outcomeOf(refusal), gate, iterations }, note: resolutionNote(refusal) };
}
