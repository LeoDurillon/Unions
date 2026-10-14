import { getTicket, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

import { runImplementStep } from './implement';
import type { ImplementDeps } from './implement-checks';
import {
  agentServices,
  pauseAgentServices,
  startAgentServices,
  withEnvironment,
} from './preview/background';
import { previewSettings } from './preview/compose';
import { containerNames, ensureTicketContainer } from './provision';
import { runRebaseStep } from './rebase';
import type { StepContext, StepResult } from './scheduler';

function previewOf(db: Db, projectId: number): ReturnType<typeof agentServices> {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  return agentServices(project?.config.preview);
}

/**
 * A step that runs code (implementation, rebase), with the services the project starts for the
 * agent running beside it, and the project's plain variables in its commands' environment. The
 * container is provisioned first: compose reads the file from its workspace.
 */
export async function withAgentServices(
  deps: ImplementDeps,
  context: StepContext,
  run: (stepDeps: ImplementDeps) => Promise<StepResult>,
): Promise<StepResult> {
  if (previewOf(deps.db, context.ticket.projectId).length === 0) {
    return run(deps);
  }
  await ensureTicketContainer(
    deps.db,
    deps.runtime,
    deps.config,
    getTicket(deps.db, context.ticket.id),
  );
  const previewDeps = {
    db: deps.db,
    runtime: deps.runtime,
    config: deps.config,
    settings: previewSettings(),
  };
  const env = await startAgentServices(previewDeps, context.ticket.id);
  try {
    return await run({
      ...deps,
      runtime: withEnvironment(deps.runtime, containerNames(context.ticket.id).name, env),
    });
  } finally {
    await pauseAgentServices(previewDeps, context.ticket.id);
  }
}

/** The steps that run code: implementation and rebase, each with the agent's services. */
export function runCodeStep(
  deps: ImplementDeps,
  context: StepContext,
  step: 'implement' | 'rebase',
): Promise<StepResult> {
  return withAgentServices(deps, context, (stepDeps) =>
    step === 'implement' ? runImplementStep(stepDeps, context) : runRebaseStep(stepDeps, context),
  );
}
