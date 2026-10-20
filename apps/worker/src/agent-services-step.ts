import { hasActiveContainerRun } from '@union/core';

import { runImplementStep } from './implement';
import type { ImplementDeps } from './implement-checks';
import { runRebaseStep } from './rebase';
import { runRestackStep } from './restack';
import type { StepContext, StepResult } from './scheduler';
import { startServicesRun } from './services-run';

/** A step that runs code (implementation, rebase), with the project's agent services beside it. */
export async function withAgentServices(
  deps: ImplementDeps,
  context: StepContext,
  run: (stepDeps: ImplementDeps) => Promise<StepResult>,
): Promise<StepResult> {
  const services = await startServicesRun(deps, context.ticket.id);
  try {
    return await run({ ...deps, runtime: services.runtime, services: services.setup });
  } finally {
    // A command the user runs meanwhile (queued during the step) may still need them.
    await services.release(hasActiveContainerRun(deps.db, { ticketId: context.ticket.id }));
  }
}

const CODE_STEPS = {
  implement: runImplementStep,
  rebase: runRebaseStep,
  restack: runRestackStep,
} as const;

/** The steps that run code: implementation, rebase and restack, each with the agent's services. */
export function runCodeStep(
  deps: ImplementDeps,
  context: StepContext,
  step: keyof typeof CODE_STEPS,
): Promise<StepResult> {
  return withAgentServices(deps, context, (stepDeps) => CODE_STEPS[step](stepDeps, context));
}
