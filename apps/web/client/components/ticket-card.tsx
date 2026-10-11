import { useDraggable } from '@dnd-kit/core';
import type { ReactElement } from 'react';

import type { TicketSummary } from '../../src/api-types';
import { describePhase } from '../lib/labels';
import { Badge } from './ui';

export function TicketCard({
  ticket,
  onOpen,
}: {
  ticket: TicketSummary;
  onOpen: (id: number) => void;
}): ReactElement {
  const draggable = ticket.phase.kind === 'backlog';
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    disabled: !draggable,
  });
  const { label, tone } = describePhase(ticket.phase);
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
      <div className="flex items-center justify-between gap-2">
        <Badge tone={tone}>{label}</Badge>
        <span className="text-xs text-zinc-500">
          {ticket.issueNumber === null ? 'not on GitHub yet' : `#${ticket.issueNumber}`}
        </span>
      </div>
    </div>
  );
}
