// A board card's state pill (when its column does not say it already) and its Start button in the backlog.

import type { ReactElement } from 'react';

import type { TicketSummary } from '../../../src/api-types';
import { describePhase, isBlocked, isStartable } from '../../lib/board/labels';
import { useCustomAgentNames } from '../../lib/union-settings/use-custom-agents';
import { StatusPill } from '../ticket/status-pill';
import { FOCUS_RING } from '../ui/focus';

/**
 * The card's state, one pill, when the column does not say it already: how the pull request ended, waiting for
 * the parent, or the phase and step of a ticket that runs, waits or stopped. Not "Not started" in Backlog, nor
 * "Done" in Done.
 */
export function CardStatus({ ticket }: { ticket: TicketSummary }): ReactElement | null {
  const names = useCustomAgentNames();
  if (ticket.board === 'merged') {
    const merged = ticket.prState === 'merged';
    return (
      <StatusPill
        size="sm"
        tone={merged ? 'green' : 'neutral'}
        label={merged ? 'Merged' : 'Closed'}
      />
    );
  }
  if (isBlocked(ticket)) {
    return <StatusPill size="sm" tone="neutral" label="Waiting for parent" />;
  }
  const { kind } = ticket.phase;
  if (kind === 'backlog' || kind === 'done') {
    return null;
  }
  const phase = describePhase(ticket.phase, names);
  return <StatusPill size="sm" tone={phase.tone} label={phase.label} title={phase.label} />;
}

/** Start while the ticket waits in the backlog; "Starting…" once clicked, until the worker takes it. */
export function StartAction({
  ticket,
  starting,
  onStart,
}: {
  ticket: TicketSummary;
  starting: boolean;
  onStart?: (id: number) => void;
}): ReactElement | null {
  if (starting) {
    return <StatusPill size="sm" tone="blue" label="Starting…" />;
  }
  if (!isStartable(ticket) || !onStart) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={() => {
        onStart(ticket.id);
      }}
      className={`relative z-[1] inline-flex h-6 items-center gap-1 rounded-md bg-indigo-600 px-2 text-[11px] font-semibold text-white hover:bg-indigo-500 ${FOCUS_RING}`}
    >
      <span aria-hidden>▶</span> Start
    </button>
  );
}
