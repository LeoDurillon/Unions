// A ticket card for the board: its issue and pull request, its title, the ticket it builds on, its state and its
// way through the flow, its CI checks, stack and a branch moved on GitHub, what its agent is doing while it runs,
// and Start while it waits in the backlog.
import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { needsYou } from '../lib/board-filter';
import { describePhase, isBlocked, isStartable, refLabel } from '../lib/labels';
import { useCustomAgentNames } from '../lib/use-custom-agents';
import { CardMeta } from './card-meta';
import { CardProgress } from './card-progress';
import { CardSignals } from './card-signals';
import { CardSteps } from './card-steps';
import { StatusPill } from './status-pill';

/**
 * The card's state, one pill, when the column does not say it already: how the pull request ended, waiting for
 * the parent, or the phase and step of a ticket that runs, waits or stopped. Not "Not started" in Backlog, nor
 * "Done" in Done.
 */
function CardStatus({ ticket }: { ticket: TicketSummary }): ReactElement | null {
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

/** The ticket it builds on, as a small chip: its whole title on hover. */
function ParentChip({ parent }: { parent: NonNullable<TicketSummary['parent']> }): ReactElement {
  return (
    <span
      title={`Starts after ${refLabel(parent)} ${parent.title}`}
      className="inline-block max-w-full truncate text-[11px] text-zinc-500 dark:text-zinc-400"
    >
      ↳ after {refLabel(parent)}
    </span>
  );
}

/** Start while the ticket waits in the backlog; "Starting…" once clicked, until the worker takes it. */
function StartAction({
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
      className="relative z-[1] inline-flex h-6 items-center gap-1 rounded-md bg-indigo-600 px-2 text-[11px] font-semibold text-white hover:bg-indigo-500"
    >
      <span aria-hidden>▶</span> Start
    </button>
  );
}

/** A card waiting for the user stands out in amber; a running one in blue. */
function cardTone(ticket: TicketSummary): string {
  if (needsYou(ticket)) {
    return 'border-amber-300 ring-1 ring-amber-200/70 dark:border-amber-800 dark:ring-amber-900/40';
  }
  if (ticket.phase.kind === 'running') {
    return 'border-blue-200 dark:border-blue-900';
  }
  return 'border-zinc-200 dark:border-zinc-800';
}

export function TicketCard({
  ticket,
  config,
  onOpen,
  onStart,
  starting = false,
  startError = null,
}: {
  ticket: TicketSummary;
  config?: PublicProject['config'];
  onOpen: (id: number) => void;
  onStart?: (id: number) => void;
  /** Start was clicked and the worker has not taken the ticket yet. */
  starting?: boolean;
  /** Why the last Start was refused. */
  startError?: string | null;
}): ReactElement {
  return (
    <div
      className={`relative space-y-2.5 rounded-xl border bg-white p-3.5 shadow-sm transition hover:-translate-y-px hover:shadow-md dark:bg-zinc-900 ${cardTone(ticket)}`}
    >
      <CardMeta ticket={ticket} config={config} />
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => {
            onOpen(ticket.id);
          }}
          title={ticket.title}
          className="line-clamp-3 text-left text-[13.5px] leading-snug font-semibold after:absolute after:inset-0 after:rounded-xl after:content-['']"
        >
          {ticket.title}
        </button>
        {ticket.parent ? <ParentChip parent={ticket.parent} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        <CardStatus ticket={ticket} />
        <StartAction ticket={ticket} starting={starting} onStart={onStart} />
      </div>
      {/* Once done, every step is behind it: the column says so. */}
      {config && ticket.phase.kind !== 'done' ? (
        <CardSteps ticket={ticket} config={config} />
      ) : null}
      {startError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          Not started: {startError}
        </p>
      ) : null}
      <CardProgress ticket={ticket} />
      <CardSignals ticket={ticket} />
    </div>
  );
}
