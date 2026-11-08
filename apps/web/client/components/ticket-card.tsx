// A ticket card for the board: its title, its state, the ticket it builds on, its pull request, its CI checks and a
// branch moved on GitHub, what its agent is doing while it runs, and Start while it waits in the backlog.
import { flowName, resolveFlow } from '@union/core/flows';
import { FULL_FLOW } from '@union/core/states';
import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { describePhase, isBlocked, isStartable, refLabel, type Tone } from '../lib/labels';
import { useCustomAgentNames } from '../lib/use-custom-agents';
import { CardProgress } from './card-progress';
import { Badge } from './ui';

const SHORT_SHA = 7;

const CHECKS: Record<NonNullable<TicketSummary['prChecksState']>, { label: string; tone: Tone }> = {
  pending: { label: 'Checks running', tone: 'amber' },
  success: { label: 'Checks passed', tone: 'green' },
  failure: { label: 'Checks failed', tone: 'red' },
};

/** The CI checks of the open pull request's head commit; nothing when they are not known. */
function ChecksBadge({ ticket }: { ticket: TicketSummary }): ReactElement | null {
  if (ticket.prState !== 'open' || ticket.prChecksState === null) {
    return null;
  }
  const { label, tone } = CHECKS[ticket.prChecksState];
  const sha = ticket.prChecksSha?.slice(0, SHORT_SHA);
  return (
    <Badge tone={tone} title={sha ? `CI checks on ${sha}` : undefined}>
      {label}
    </Badge>
  );
}

/** How the ticket's pull request ended, for the Merged / Closed column; null while it has not. */
/** The branch moved on GitHub since Union pushed it: the Pull request tab offers a resync. */
function MovedBadge({ ticket }: { ticket: TicketSummary }): ReactElement | null {
  if (ticket.prState !== 'open' || ticket.remoteMoved === null) {
    return null;
  }
  return (
    <Badge tone="amber" title="Resync it from the Pull request tab">
      Branch moved
    </Badge>
  );
}

function PrEnd({ prState }: { prState: TicketSummary['prState'] }): ReactElement {
  return prState === 'merged' ? (
    <Badge tone="blue">Merged</Badge>
  ) : (
    <Badge tone="red">Closed</Badge>
  );
}

/** The card's state, one pill: how the pull request ended, else whether it waits, else its phase and step. */
function CardStatus({ ticket }: { ticket: TicketSummary }): ReactElement {
  const names = useCustomAgentNames();
  if (ticket.board === 'merged') {
    return <PrEnd prState={ticket.prState} />;
  }
  if (isBlocked(ticket)) {
    return <Badge tone="amber">Waiting for parent</Badge>;
  }
  const phase = describePhase(ticket.phase, names);
  return <Badge tone={phase.tone}>{phase.label}</Badge>;
}

/** A split ticket: its stack's size, what merged, and its pull requests. */
function StackBadge({ stack }: { stack: NonNullable<TicketSummary['stack']> }): ReactElement {
  const prs = stack.slices.flatMap((slice) =>
    slice.prNumber === null ? [] : [`#${slice.prNumber}`],
  );
  const wrong = stack.outOfOrder.length > 0 || stack.closed.length > 0;
  return (
    <Badge tone={wrong ? 'red' : 'neutral'} title={prs.join(' → ')}>
      {stack.label}
    </Badge>
  );
}

/** The flow's name when it is not the full pipeline: a short flow is worth seeing on the board. */
function FlowBadge({
  ticket,
  config,
}: {
  ticket: TicketSummary;
  config: PublicProject['config'];
}): ReactElement | null {
  const flow = resolveFlow(ticket, config);
  if (flow.length === FULL_FLOW.length) {
    return null;
  }
  return <Badge tone="neutral">{flowName(flow, config)}</Badge>;
}

/** The ticket it builds on, as a small chip: its whole title on hover. */
function ParentChip({ parent }: { parent: NonNullable<TicketSummary['parent']> }): ReactElement {
  return (
    <span
      title={`Starts after ${refLabel(parent)} ${parent.title}`}
      className="inline-block max-w-full truncate rounded border border-zinc-200 px-1.5 text-xs text-zinc-500 dark:border-zinc-700"
    >
      ↳ after {refLabel(parent)}
    </span>
  );
}

/** Starts the agent on a backlog ticket, above the card's own click. */
function StartButton({ onStart }: { onStart: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onStart}
      className="relative z-[1] rounded-md border border-indigo-300 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
    >
      Start
    </button>
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
    return <Badge tone="blue">Starting…</Badge>;
  }
  return isStartable(ticket) && onStart ? (
    <StartButton
      onStart={() => {
        onStart(ticket.id);
      }}
    />
  ) : null;
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
    <div className="relative space-y-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => {
          onOpen(ticket.id);
        }}
        title={ticket.title}
        className="line-clamp-3 text-left text-sm font-medium after:absolute after:inset-0 after:content-['']"
      >
        {ticket.title}
      </button>
      {ticket.parent ? <ParentChip parent={ticket.parent} /> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CardStatus ticket={ticket} />
        <ChecksBadge ticket={ticket} />
        <MovedBadge ticket={ticket} />
        {ticket.stack ? <StackBadge stack={ticket.stack} /> : null}
        {config ? <FlowBadge ticket={ticket} config={config} /> : null}
        <StartAction ticket={ticket} starting={starting} onStart={onStart} />
        <span className="ml-auto text-xs whitespace-nowrap text-zinc-500">
          {ticket.issueNumber === null ? 'not on GitHub yet' : `#${ticket.issueNumber}`}
        </span>
      </div>
      {startError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          Not started: {startError}
        </p>
      ) : null}
      <CardProgress ticket={ticket} />
    </div>
  );
}
