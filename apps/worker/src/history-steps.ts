// The steps that rewrite a reviewed branch's history, the code unchanged: simplify, and the split into a stack.
import { listSlices, openSlices, type Step } from '@union/core';

import { withAgentServices } from './agent-services-step';
import type { ImplementDeps } from './implement-checks';
import type { StepContext, StepResult } from './scheduler';
import { runSimplifyStep } from './simplify';
import { runStackSimplifyStep } from './simplify-stack';
import { runSplitStep } from './split';
import { runSplitPlanStep } from './split-plan-step';

const HISTORY_STEPS = ['simplify', 'split_plan', 'split'] as const;
type HistoryStep = (typeof HISTORY_STEPS)[number];

export function isHistoryStep(step: Step): step is HistoryStep {
  return HISTORY_STEPS.some((history) => history === step);
}

/** A split ticket's history is simplified slice by slice, once the merged slices were restacked. */
function runSimplify(deps: ImplementDeps, context: StepContext): Promise<StepResult> {
  const ticketId = context.ticket.id;
  if (listSlices(deps.db, ticketId).some((slice) => slice.mergedTipSha !== null)) {
    return Promise.resolve({
      kind: 'error',
      error: 'A merged slice was not restacked yet: restack the stack first.',
    });
  }
  return openSlices(deps.db, ticketId).length > 1
    ? runStackSimplifyStep(deps, context)
    : runSimplifyStep(deps, context);
}

export function runHistoryStep(
  deps: ImplementDeps,
  context: StepContext,
  step: HistoryStep,
): Promise<StepResult> {
  switch (step) {
    // The code stays the same: no install, checks or services.
    case 'simplify': {
      return runSimplify(deps, context);
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
