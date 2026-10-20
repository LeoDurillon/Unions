// The state machine's moves for a stack of pull requests: planning a split, splitting, restacking.

import { backToReview, running, thenDoneOf, type Action, type Phase } from './phases';

/**
 * A split or a restack is asked at the final review, or once done: the branch is reviewed, and a
 * split leaves the code as it is, so the ticket comes back to where it was.
 */
function fromReviewed(phase: Phase, action: Action): Phase | undefined {
  const reviewed = phase.kind === 'awaiting_approval' && phase.step === 'final_review';
  if (!reviewed && phase.kind !== 'done') {
    return undefined;
  }
  const done = phase.kind === 'done' ? { thenDone: true as const } : {};
  if (action.type === 'split') {
    return { kind: 'running', step: 'split_plan', ...done };
  }
  if (action.type === 'restack') {
    const next = running('restack');
    return next.kind === 'running' ? { ...next, ...done } : next;
  }
  return undefined;
}

/** The plan waits for the user: approved, it is built; revised, planned again; dropped, forgotten. */
function fromPlan(phase: Phase & { kind: 'awaiting_approval' }, action: Action): Phase | null {
  if (action.type === 'approve') {
    return { kind: 'running', step: 'split', ...thenDoneOf(phase) };
  }
  if (action.type === 'revise') {
    return { kind: 'running', step: 'split_plan', ...thenDoneOf(phase) };
  }
  return action.type === 'drop_split' ? backToReview(phase) : null;
}

function fromStackRun(phase: Phase & { kind: 'running' }, action: Action): Phase | undefined {
  if (action.type === 'run_finished' && phase.step === 'split_plan') {
    return { kind: 'awaiting_approval', step: 'split_plan', ...thenDoneOf(phase) };
  }
  // The history is rewritten, the code the same: the final review still stands.
  if (action.type === 'run_finished' && phase.step === 'split') {
    return backToReview(phase);
  }
  if (action.type === 'rebased_clean' && phase.step === 'restack') {
    return backToReview(phase);
  }
  return undefined;
}

/**
 * The phase a stack action leads to; null when it is refused there, undefined when the generic
 * moves decide (a run that failed, a retry, a cancel).
 */
export function stackTransition(phase: Phase, action: Action): Phase | null | undefined {
  if (phase.kind === 'awaiting_approval' && phase.step === 'split_plan') {
    return fromPlan(phase, action);
  }
  if (phase.kind === 'running') {
    return fromStackRun(phase, action);
  }
  const reviewed = fromReviewed(phase, action);
  if (reviewed !== undefined) {
    return reviewed;
  }
  const stackOnly = action.type === 'split' || action.type === 'restack';
  return stackOnly || action.type === 'drop_split' ? null : undefined;
}
