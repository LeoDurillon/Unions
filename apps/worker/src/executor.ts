// Every step: planning and custom agents, implementation, final review, and the rebase, simplify
// and split asked on demand.
import { isCustomStep, type ContainerRuntime, type Db } from '@union/core';

import { runAgent } from './agent';
import { runCodeStep } from './agent-services-step';
import { ensureFollowedBase } from './followed-base-ref';
import { isHistoryStep, runHistoryStep } from './history-steps';
import { runPlanningStep } from './planning-step';
import { isPlanningStep } from './prompts';
import type { ProvisionConfig } from './provision';
import { runReviewStep } from './review';
import type { StepContext, StepExecutor, StepResult } from './scheduler';

/**
 * Every step: planning and custom agents, implementation, final review, and the rebase, simplify
 * and split asked on demand.
 */
export function createExecutor(
  db: Db,
  runtime: ContainerRuntime,
  config: ProvisionConfig,
  github: Parameters<typeof runCodeStep>[0]['github'],
): StepExecutor {
  return async (context: StepContext): Promise<StepResult> => {
    const deps = { db, runtime, config, github, agent: runAgent };
    await ensureFollowedBase(deps, context);
    return runStep(deps, context);
  };
}

/** The step itself, by kind. */
function runStep(
  deps: Parameters<typeof runCodeStep>[0],
  context: StepContext,
): Promise<StepResult> {
  const { step } = context;
  if (step === 'implement' || step === 'rebase' || step === 'retarget' || step === 'restack') {
    return runCodeStep(deps, context, step);
  }
  if (step === 'final_review') {
    return runReviewStep(deps, context);
  }
  if (isHistoryStep(step)) {
    return runHistoryStep(deps, context, step);
  }
  if (!isPlanningStep(step) && !isCustomStep(step)) {
    return Promise.resolve({ kind: 'error', error: `Unknown step ${JSON.stringify(step)}` });
  }
  const { db, runtime, config } = deps;
  return runPlanningStep({ db, runtime, config }, { ...context, step });
}
