// Start over: a planning or custom step that waits for the user, or stopped, runs again from scratch.

import { PLANNING_STEPS, type Action, type Phase, type Step } from '../phases';

/** The step that can start over: a planning or custom one (it changes no file), stopped or waiting. */
function startOverStep(phase: Phase): Step | null {
  if (
    phase.kind !== 'awaiting_approval' &&
    phase.kind !== 'failed' &&
    phase.kind !== 'rate_limited'
  ) {
    return null;
  }
  const { step } = phase;
  return PLANNING_STEPS.some((planning) => planning === step) || step.startsWith('agent_')
    ? step
    : null;
}

/** Whether the ticket's step can start over, forgetting its session, versions and feedback. */
export function canStartOver(phase: Phase): boolean {
  return startOverStep(phase) !== null;
}

/** The run that starts over; undefined when `action` is not a start over, null when refused. */
export function startOverTransition(phase: Phase, action: Action): Phase | null | undefined {
  if (action.type !== 'start_over') {
    return undefined;
  }
  const step = startOverStep(phase);
  return step ? { kind: 'running', step, fresh: true } : null;
}
