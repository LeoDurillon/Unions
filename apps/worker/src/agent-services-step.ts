import { hasActiveContainerRun } from '@union/core';

import { runImplementStep } from './implement';
import type { ImplementDeps } from './implement-checks';
import { runRebaseStep } from './rebase';
import { runRestackStep } from './restack';
import { runRetargetStep } from './retarget';
import type { StepContext, StepResult } from './scheduler';
import { startServicesRun } from './services-run';
import { startStepPreview, withPreviewEnv } from './step-preview';

/**
 * A step that runs code (implementation, rebase), with the project's agent services beside it and,
 * while the preview runs, its addresses in the environment.
 */
export async function withAgentServices(
  deps: ImplementDeps,
  context: StepContext,
  run: (stepDeps: ImplementDeps) => Promise<StepResult>,
): Promise<StepResult> {
  const ticketId = context.ticket.id;
  const services = await startServicesRun(deps, ticketId);
  try {
    const runtime = withPreviewEnv(deps.db, services.runtime, ticketId);
    return await run({ ...deps, runtime, services: services.setup });
  } finally {
    // A command the user runs meanwhile (queued during the step) may still need them.
    await services.release(hasActiveContainerRun(deps.db, { ticketId: context.ticket.id }));
  }
}

const CODE_STEPS = {
  implement: runImplementStep,
  rebase: runRebaseStep,
  retarget: runRetargetStep,
  restack: runRestackStep,
} as const;

/**
 * The steps that run code: implementation, rebase (and its change of target) and restack, each with
 * the agent's services; an implementation with the preview too, when the project asks for it.
 */
export async function runCodeStep(
  deps: ImplementDeps,
  context: StepContext,
  step: keyof typeof CODE_STEPS,
): Promise<StepResult> {
  if (step === 'implement') {
    await startStepPreview(deps, context.ticket.id);
  }
  return withAgentServices(deps, context, (stepDeps) => CODE_STEPS[step](stepDeps, context));
}
