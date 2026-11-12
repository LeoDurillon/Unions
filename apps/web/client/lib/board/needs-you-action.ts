// What a ticket that needs the user asks of them, in a few words: the step to read, the run that failed, red CI.

import type { CustomAgentNames } from '@union/core';
import { stepTitle } from '@union/core/step-titles';

import type { TicketSummary } from '../../../src/api-types';

export type NeedsYouAction = { text: string; tone: 'amber' | 'red' };

const CHECKS_FAILED: NeedsYouAction = { text: 'Checks failed', tone: 'red' };

/** The ask of a ticket `needsYou` keeps; for one it does not keep, its CI checks (the last rule). */
export function needsYouAction(ticket: TicketSummary, names: CustomAgentNames): NeedsYouAction {
  const { phase } = ticket;
  switch (phase.kind) {
    case 'awaiting_approval': {
      return { text: `${stepTitle(phase.step, names)} waits for you`, tone: 'amber' };
    }
    case 'failed': {
      return { text: `${stepTitle(phase.step, names)} failed`, tone: 'red' };
    }
    case 'commit_refused': {
      return { text: 'A git hook refused the commit', tone: 'amber' };
    }
    case 'backlog':
    case 'running':
    case 'rate_limited':
    case 'done':
    case 'cancelled': {
      return CHECKS_FAILED;
    }
    default: {
      return CHECKS_FAILED;
    }
  }
}
