// Board labels: the columns, what a ticket is doing, its reference, and whether it waits for its
// parent.
import type { BoardColumn, CustomAgentNames, Phase, Step } from '@union/core';
import { stepTitle } from '@union/core/step-titles';

export { STEP_TITLES } from '@union/core/states';
export { stepTitle } from '@union/core/step-titles';

export const COLUMNS: { status: BoardColumn; title: string }[] = [
  { status: 'backlog', title: 'Backlog' },
  { status: 'in_progress', title: 'In progress' },
  { status: 'in_review', title: 'In review' },
  { status: 'done', title: 'Done' },
  { status: 'merged', title: 'Merged / Closed' },
];

export type Tone = 'neutral' | 'blue' | 'amber' | 'red' | 'green';

/** What the ticket is doing (`status`), on which step if any; `label` joins the two. */
export type PhaseDescription = { label: string; status: string; step: string | null; tone: Tone };

function stepPhase(
  status: string,
  step: Step,
  tone: Tone,
  names: CustomAgentNames,
): PhaseDescription {
  const title = stepTitle(step, names);
  return { label: `${status} · ${title}`, status, step: title, tone };
}

function plainPhase(status: string, tone: Tone): PhaseDescription {
  return { label: status, status, step: null, tone };
}

/** `names`: the custom agents', for a ticket on a custom step. */
export function describePhase(phase: Phase, names: CustomAgentNames = {}): PhaseDescription {
  switch (phase.kind) {
    case 'backlog': {
      return plainPhase('Not started', 'neutral');
    }
    case 'running': {
      return stepPhase('Running', phase.step, 'blue', names);
    }
    case 'awaiting_approval': {
      return stepPhase('Needs review', phase.step, 'amber', names);
    }
    case 'commit_refused': {
      return stepPhase('Commit refused', phase.step, 'amber', names);
    }
    case 'rate_limited': {
      return stepPhase('Rate limited', phase.step, 'red', names);
    }
    case 'failed': {
      return stepPhase('Failed', phase.step, 'red', names);
    }
    case 'done': {
      return plainPhase('Done', 'green');
    }
    case 'cancelled': {
      return plainPhase('Cancelled', 'neutral');
    }
    default: {
      return plainPhase('Unknown', 'neutral');
    }
  }
}

/** The step the ticket is currently on, if any. */
export function currentStep(phase: Phase): Step | null {
  return 'step' in phase ? phase.step : null;
}

/** `#12` once the ticket has a GitHub issue, else its local id. */
export function refLabel(ref: { id: number; issueNumber: number | null }): string {
  return ref.issueNumber === null ? `ticket ${ref.id}` : `#${ref.issueNumber}`;
}

/** The ticket waits for its parent: it cannot start before the parent is done. */
export function isBlocked(ticket: { parent: { done: boolean } | null }): boolean {
  return ticket.parent !== null && !ticket.parent.done;
}
