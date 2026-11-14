// What a step's Approve button says: what approving finishes, or the step it starts and its model.

import type { AfterApproval, Step } from '@union/core';
import { stepTitle } from '@union/core/step-titles';

import { useCustomAgentNames } from '../../lib/union-settings/use-custom-agents';

/** What Approve says: what it finishes, or the step it starts and its model ("Approve → Test plan (Sonnet)"). */
export function useApproveLabel(step: Step, next: AfterApproval | null): string {
  const names = useCustomAgentNames();
  if (step === 'final_review') {
    return 'Approve and mark PR ready';
  }
  if (step === 'split_plan') {
    return 'Approve and split';
  }
  return next ? `Approve → ${stepTitle(next.step, names)} (${modelName(next.model)})` : 'Approve';
}

/** A model as the button names it: `sonnet` → Sonnet. */
function modelName(model: AfterApproval['model']): string {
  return model.charAt(0).toUpperCase() + model.slice(1);
}
