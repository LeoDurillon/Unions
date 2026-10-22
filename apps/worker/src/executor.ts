import { isCustomStep, type ContainerRuntime, type Db, type Project } from '@union/core';

import { runAgent } from './agent';
import { runCodeStep } from './agent-services-step';
import type { GitHubApi } from './github/api';
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
  github: (project: Project) => GitHubApi | null,
): StepExecutor {
  return (context: StepContext): Promise<StepResult> => {
    const { step } = context;
    const deps = { db, runtime, config, github, agent: runAgent };
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
    return runPlanningStep({ db, runtime, config }, { ...context, step });
  };
}
