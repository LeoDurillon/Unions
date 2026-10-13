import type { BoardStatus, Phase, Step } from '@union/core';

export const STEP_TITLES: Record<Step, string> = {
  intake: 'Intake',
  summary: 'Summary',
  technical: 'Technical',
  test_plan: 'Test plan',
  implement: 'Implementation',
  final_review: 'Final review',
  rebase: 'Rebase',
};

export const COLUMNS: { status: BoardStatus; title: string }[] = [
  { status: 'backlog', title: 'Backlog' },
  { status: 'in_progress', title: 'In progress' },
  { status: 'in_review', title: 'In review' },
  { status: 'done', title: 'Done' },
];

export type Tone = 'neutral' | 'blue' | 'amber' | 'red' | 'green';

export function describePhase(phase: Phase): { label: string; tone: Tone } {
  switch (phase.kind) {
    case 'backlog': {
      return { label: 'Not started', tone: 'neutral' };
    }
    case 'running': {
      return { label: `Running · ${STEP_TITLES[phase.step]}`, tone: 'blue' };
    }
    case 'awaiting_approval': {
      return { label: `Needs review · ${STEP_TITLES[phase.step]}`, tone: 'amber' };
    }
    case 'commit_refused': {
      return { label: `Commit refused · ${STEP_TITLES[phase.step]}`, tone: 'amber' };
    }
    case 'rate_limited': {
      return { label: `Rate limited · ${STEP_TITLES[phase.step]}`, tone: 'red' };
    }
    case 'failed': {
      return { label: `Failed · ${STEP_TITLES[phase.step]}`, tone: 'red' };
    }
    case 'done': {
      return { label: 'Done', tone: 'green' };
    }
    case 'cancelled': {
      return { label: 'Cancelled', tone: 'neutral' };
    }
    default: {
      return { label: 'Unknown', tone: 'neutral' };
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
