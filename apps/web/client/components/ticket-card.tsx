// A draggable ticket card for the board, with its phase, pull request and CI checks badges.
import { useDraggable } from '@dnd-kit/core';
import { flowName, resolveFlow } from '@union/core/flows';
import { FULL_FLOW } from '@union/core/states';
import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { describePhase, isBlocked, refLabel, type Tone } from '../lib/labels';
import { useCustomAgentNames } from '../lib/use-custom-agents';
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
function PrEnd({ prState }: { prState: TicketSummary['prState'] }): ReactElement {
  return prState === 'merged' ? (
    <Badge tone="blue">Merged</Badge>
  ) : (
    <Badge tone="red">Closed</Badge>
  );
}

/** The card's status line: how the pull request ended, else whether it waits, else its phase. */
function CardStatus({ ticket }: { ticket: TicketSummary }): ReactElement {
  const names = useCustomAgentNames();
  if (ticket.board === 'merged') {
    return <PrEnd prState={ticket.prState} />;
  }
  if (isBlocked(ticket)) {
    return <Badge tone="amber">Waiting for parent</Badge>;
  }
  const phase = describePhase(ticket.phase, names);
  return (
    <>
      <Badge tone={phase.tone}>{phase.status}</Badge>
      {phase.step === null ? null : (
        <span className="text-xs whitespace-nowrap text-zinc-500">{phase.step}</span>
      )}
    </>
  );
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

export function TicketCard({
  ticket,
  config,
  onOpen,
}: {
  ticket: TicketSummary;
  config?: PublicProject['config'];
  onOpen: (id: number) => void;
}): ReactElement {
  const blocked = isBlocked(ticket);
  const draggable = ticket.phase.kind === 'backlog' && !blocked;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    disabled: !draggable,
  });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;
  const dragProps = draggable ? { ...listeners, ...attributes } : {};
  const state = isDragging ? 'opacity-60 shadow-lg' : 'hover:border-indigo-400';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragProps}
      className={`relative space-y-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition dark:border-zinc-800 dark:bg-zinc-900 ${draggable ? 'cursor-grab' : ''} ${state}`}
    >
      <button
        type="button"
        onClick={() => {
          onOpen(ticket.id);
        }}
        className="text-left text-sm font-medium after:absolute after:inset-0 after:content-['']"
      >
        {ticket.title}
      </button>
      {ticket.parent ? (
        <p className="text-xs text-zinc-500">
          ↳ after {refLabel(ticket.parent)} {ticket.parent.title}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CardStatus ticket={ticket} />
        <ChecksBadge ticket={ticket} />
        {ticket.stack ? <StackBadge stack={ticket.stack} /> : null}
        {config ? <FlowBadge ticket={ticket} config={config} /> : null}
        <span className="ml-auto text-xs whitespace-nowrap text-zinc-500">
          {ticket.issueNumber === null ? 'not on GitHub yet' : `#${ticket.issueNumber}`}
        </span>
      </div>
    </div>
  );
}
