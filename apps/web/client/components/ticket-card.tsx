import { useDraggable } from '@dnd-kit/core';
import type { ReactElement } from 'react';

import type { TicketSummary } from '../../src/api-types';
import { describePhase, isBlocked, refLabel } from '../lib/labels';
import { Badge } from './ui';

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
  if (ticket.board === 'merged') {
    return <PrEnd prState={ticket.prState} />;
  }
  if (isBlocked(ticket)) {
    return <Badge tone="amber">Waiting for parent</Badge>;
  }
  const phase = describePhase(ticket.phase);
  return (
    <>
      <Badge tone={phase.tone}>{phase.status}</Badge>
      {phase.step === null ? null : (
        <span className="text-xs whitespace-nowrap text-zinc-500">{phase.step}</span>
      )}
    </>
  );
}

export function TicketCard({
  ticket,
  onOpen,
}: {
  ticket: TicketSummary;
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
        <span className="ml-auto text-xs whitespace-nowrap text-zinc-500">
          {ticket.issueNumber === null ? 'not on GitHub yet' : `#${ticket.issueNumber}`}
        </span>
      </div>
    </div>
  );
}
