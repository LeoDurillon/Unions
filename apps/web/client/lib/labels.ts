import type { BoardColumn, Phase, Step } from '@union/core';

export const STEP_TITLES: Record<Step, string> = {
  intake: 'Intake',
  summary: 'Summary',
  technical: 'Technical',
  test_plan: 'Test plan',
  implement: 'Implementation',
  final_review: 'Final review',
  rebase: 'Rebase',
};

export const COLUMNS: { status: BoardColumn; title: string }[] = [
  { status: 'backlog', title: 'Backlog' },
  { status: 'in_progress', title: 'In progress' },
  { status: 'in_review', title: 'In review' },
  { status: 'done', title: 'Done' },
  { status: 'merged', title: 'Merged' },
];

export type Tone = 'neutral' | 'blue' | 'amber' | 'red' | 'green';

/** What the ticket is doing (`status`), on which step if any; `label` joins the two. */
export type PhaseDescription = { label: string; status: string; step: string | null; tone: Tone };

function stepPhase(status: string, step: Step, tone: Tone): PhaseDescription {
  return { label: `${status} · ${STEP_TITLES[step]}`, status, step: STEP_TITLES[step], tone };
}

function plainPhase(status: string, tone: Tone): PhaseDescription {
  return { label: status, status, step: null, tone };
}

export function describePhase(phase: Phase): PhaseDescription {
  switch (phase.kind) {
    case 'backlog': {
      return plainPhase('Not started', 'neutral');
    }
    case 'running': {
      return stepPhase('Running', phase.step, 'blue');
    }
    case 'awaiting_approval': {
      return stepPhase('Needs review', phase.step, 'amber');
    }
    case 'commit_refused': {
      return stepPhase('Commit refused', phase.step, 'amber');
    }
    case 'rate_limited': {
      return stepPhase('Rate limited', phase.step, 'red');
    }
    case 'failed': {
      return stepPhase('Failed', phase.step, 'red');
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
