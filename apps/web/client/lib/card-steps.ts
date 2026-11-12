// A board card's flow as a row of segments: the steps done, the one it is on (running, waiting, stalled), the rest.
import type { CustomAgentNames, Phase } from '@union/core';
import { resolveFlow } from '@union/core/flows';
import type { Step } from '@union/core/states';
import { stepTitle } from '@union/core/step-titles';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import type { StopState } from './ticket-progress';

export type CardSegment = { id: string; label: string; state: StopState };

/** What the step the ticket is on looks like; null when the phase is on no step. */
function activeState(phase: Phase): StopState | null {
  switch (phase.kind) {
    case 'running': {
      return 'running';
    }
    case 'awaiting_approval': {
      return 'waiting';
    }
    case 'failed':
    case 'rate_limited':
    case 'commit_refused': {
      return 'stalled';
    }
    case 'backlog':
    case 'done':
    case 'cancelled': {
      return null;
    }
    default: {
      return null;
    }
  }
}

/**
 * One segment per step of the ticket's flow; null in Backlog and once cancelled, where there is no way
 * through to show. On a step outside the flow (a rebase, a split), the flow's steps are all behind it.
 */
export function cardSegments(
  ticket: Pick<TicketSummary, 'phase' | 'flow'>,
  config: PublicProject['config'],
  names: CustomAgentNames,
): CardSegment[] | null {
  const { phase } = ticket;
  if (phase.kind === 'backlog' || phase.kind === 'cancelled') {
    return null;
  }
  const flow = resolveFlow(ticket, config);
  const steps: readonly Step[] = flow;
  const at = 'step' in phase ? steps.indexOf(phase.step) : -1;
  const active = activeState(phase);
  return flow.map((step, index) => {
    const label = stepTitle(step, names);
    if (at === -1 || index < at) {
      return { id: step, label, state: 'done' };
    }
    if (index === at && active) {
      return { id: step, label, state: active };
    }
    return { id: step, label, state: 'todo' };
  });
}
