// The steps that rewrite a reviewed branch's history, the code unchanged: simplify, and the split into a stack.
import type { Step } from '@union/core';

import { withAgentServices } from './agent-services-step';
import type { ImplementDeps } from './implement-checks';
import type { StepContext, StepResult } from './scheduler';
import { runSimplifyStep } from './simplify';
import { runSplitStep } from './split';
import { runSplitPlanStep } from './split-plan-step';

const HISTORY_STEPS = ['simplify', 'split_plan', 'split'] as const;
type HistoryStep = (typeof HISTORY_STEPS)[number];

export function isHistoryStep(step: Step): step is HistoryStep {
  return HISTORY_STEPS.some((history) => history === step);
}

export function runHistoryStep(
  deps: ImplementDeps,
  context: StepContext,
  step: HistoryStep,
): Promise<StepResult> {
  switch (step) {
    // The code stays the same: no install, checks or services.
    case 'simplify': {
      return runSimplifyStep(deps, context);
    }
    case 'split_plan': {
      return runSplitPlanStep(deps, context);
    }
    // Each slice's checks may need the agent's services.
    case 'split': {
      return withAgentServices(deps, context, (stepDeps) => runSplitStep(stepDeps, context));
    }
    default: {
      throw new Error(`Not a history step: ${String(step satisfies never)}`);
    }
  }
}
