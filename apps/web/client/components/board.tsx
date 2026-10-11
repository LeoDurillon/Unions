import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardStatus } from '@union/core';
import type { ReactElement } from 'react';

import type { TicketSummary } from '../../src/api-types';
import { api } from '../lib/api';
import { COLUMNS } from '../lib/labels';
import { TicketCard } from './ticket-card';
import { ErrorText } from './ui';

const DRAG_DISTANCE_PX = 6;

function Column({
  status,
  title,
  tickets,
  onOpen,
}: {
  status: BoardStatus;
  title: string;
  tickets: TicketSummary[];
  onOpen: (id: number) => void;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={`flex h-full min-w-60 flex-1 flex-col gap-2 rounded-xl p-3 transition ${isOver ? 'bg-indigo-100 dark:bg-indigo-950' : 'bg-zinc-100 dark:bg-zinc-900/60'}`}
    >
      <h2 className="flex items-center justify-between text-sm font-semibold">
        {title}
        <span className="text-xs font-normal text-zinc-500">{tickets.length}</span>
      </h2>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function useStartOnDrop(): { start: (event: DragEndEvent) => void; error: Error | null } {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (ticketId: number) => api.command(ticketId, 'start'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });
  const start = (event: DragEndEvent): void => {
    if (event.over?.id === 'in_progress' && typeof event.active.id === 'number') {
      mutation.mutate(event.active.id);
    }
  };
  return { start, error: mutation.error };
}

/** The four columns, filling the screen down to the bottom edge. */
export function BoardView({
  tickets,
  error,
  onOpen,
  onStart,
}: {
  tickets: TicketSummary[];
  error: Error | null;
  onOpen: (id: number) => void;
  onStart: (event: DragEndEvent) => void;
}): ReactElement {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }),
  );
  return (
    <div className="flex h-full flex-col gap-3 px-4 pt-3 pb-4">
      <p className="text-xs text-zinc-500">
        Drag a backlog ticket into &quot;In progress&quot; to start the agent.
      </p>
      <ErrorText error={error} />
      <DndContext sensors={sensors} onDragEnd={onStart}>
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
          {COLUMNS.map(({ status, title }) => (
            <Column
              key={status}
              status={status}
              title={title}
              tickets={tickets.filter((ticket) => ticket.board === status)}
              onOpen={onOpen}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

export function Board({
  projectId,
  onOpen,
}: {
  projectId: number;
  onOpen: (id: number) => void;
}): ReactElement {
  const tickets = useQuery({
    queryKey: ['tickets', projectId],
    queryFn: () => api.tickets(projectId),
  });
  const { start, error } = useStartOnDrop();
  return (
    <BoardView
      tickets={tickets.data ?? []}
      error={error ?? tickets.error}
      onOpen={onOpen}
      onStart={start}
    />
  );
}
