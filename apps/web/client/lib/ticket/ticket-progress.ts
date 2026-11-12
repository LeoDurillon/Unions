// The ticket's way through its flow, one stop per step then Done and Merged: what each did, or does now.

import type { CustomAgentNames, Phase } from '@union/core';
import type { Step } from '@union/core/states';
import { stepTitle } from '@union/core/step-titles';

import type { TicketDetail } from '../../../src/api-types';
import { currentStep } from '../board/labels';
import { formatDuration, runsDuration } from '../ui/duration';
import { parseVerdict } from './verdict';
import { flowStepsOf } from './worker-tabs';

/** `stalled`: failed, out of usage or refused by a hook; `todo`: not reached (or reached before a revision). */
export type StopState = 'done' | 'running' | 'waiting' | 'stalled' | 'todo';

export type ProgressStop = {
  id: string;
  /** The step's tab; null for Done and Merged. */
  step: Step | null;
  label: string;
  state: StopState;
  note: string;
};

const STALLED_NOTES = {
  failed: 'Failed',
  rate_limited: 'Usage limit',
  commit_refused: 'Commit refused',
} as const;

const VERDICT_NOTES = { changes_requested: 'Changes requested', approved: 'Approves' } as const;

const NOT_ACTIVE = { state: 'todo', note: '' } as const;

/** The stop of the step the ticket is on now. */
function activeStop(
  detail: TicketDetail,
  step: Step,
  phase: Phase,
): Pick<ProgressStop, 'state' | 'note'> {
  switch (phase.kind) {
    case 'running': {
      return { state: 'running', note: 'Running' };
    }
    case 'awaiting_approval': {
      const latest = detail.outputs.findLast((output) => output.step === step);
      const verdict = step === 'final_review' && latest ? parseVerdict(latest.content) : null;
      return { state: 'waiting', note: verdict ? VERDICT_NOTES[verdict] : 'Waiting for you' };
    }
    case 'failed':
    case 'rate_limited':
    case 'commit_refused': {
      return { state: 'stalled', note: STALLED_NOTES[phase.kind] };
    }
    case 'backlog':
    case 'done':
    case 'cancelled': {
      return NOT_ACTIVE;
    }
    default: {
      return NOT_ACTIVE;
    }
  }
}

/** "v2 · 1h 22m": how many versions the step wrote and how long its runs took. */
function doneNote(detail: TicketDetail, step: Step): string {
  const versions = detail.outputs.filter((output) => output.step === step).length;
  const took = runsDuration(detail.runs.filter((run) => run.step === step));
  return [versions > 1 ? `v${versions}` : null, took > 0 ? formatDuration(took) : null]
    .filter((part) => part !== null)
    .join(' · ');
}

function stepStop(
  detail: TicketDetail,
  step: Step,
  later: boolean,
  names: CustomAgentNames,
): ProgressStop {
  const base = { id: step, step, label: stepTitle(step, names) };
  const { phase } = detail.ticket;
  if (currentStep(phase) === step) {
    return { ...base, ...activeStop(detail, step, phase) };
  }
  const ran = detail.outputs.some((output) => output.step === step);
  if (!ran || later) {
    return { ...base, state: 'todo', note: ran ? 'Runs again' : '' };
  }
  return { ...base, state: 'done', note: doneNote(detail, step) || 'Done' };
}

/** Done, then Merged (or Closed, or Cancelled): where the ticket ends. */
function endStops(detail: TicketDetail): ProgressStop[] {
  const { phase, prState } = detail.ticket;
  const finished = phase.kind === 'done';
  const done: ProgressStop = finished
    ? { id: 'done', step: null, label: 'Done', state: 'done', note: 'PR ready' }
    : { id: 'done', step: null, label: 'Done', state: 'todo', note: 'PR ready' };
  if (phase.kind === 'cancelled') {
    return [{ id: 'done', step: null, label: 'Cancelled', state: 'stalled', note: 'Stopped' }];
  }
  if (prState === 'merged' || prState === 'closed') {
    const label = prState === 'merged' ? 'Merged' : 'Closed';
    return [done, { id: 'merged', step: null, label, state: 'done', note: 'On GitHub' }];
  }
  return [done, { id: 'merged', step: null, label: 'Merged', state: 'todo', note: 'On GitHub' }];
}

/** The flow's steps then where the ticket ends; a step after the current one waits, even if it ran before. */
export function progressOf(detail: TicketDetail, names: CustomAgentNames): ProgressStop[] {
  const steps = flowStepsOf(detail);
  const current = currentStep(detail.ticket.phase);
  const at = current === null ? -1 : steps.indexOf(current);
  const stops = steps.map((step, index) => stepStop(detail, step, at >= 0 && index > at, names));
  return [...stops, ...endStops(detail)];
}
