import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardColumn } from '@union/core';
import { leftBoard } from '@union/core/states';
import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { api } from '../lib/api';
import { COLUMNS } from '../lib/labels';
import { TicketCard } from './ticket-card';
import { ErrorText } from './ui';

const DRAG_DISTANCE_PX = 6;

type Config = PublicProject['config'];

function Column({
  status,
  title,
  tickets,
  config,
  onOpen,
}: {
  status: BoardColumn;
  title: string;
  tickets: TicketSummary[];
  config?: Config;
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
          <TicketCard key={ticket.id} ticket={ticket} config={config} onOpen={onOpen} />
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

/**
 * The columns, filling the screen down to the bottom edge. Merged / Closed keeps a ticket three weeks
 * after its pull request was merged or closed.
 */
export function BoardView({
  tickets,
  now,
  error,
  config,
  onOpen,
  onStart,
}: {
  tickets: TicketSummary[];
  /** The project's flows, to name a ticket's on its card. */
  config?: Config;
  /** When the tickets were read: Merged / Closed drops those that ended three weeks before. */
  now: number;
  error: Error | null;
  onOpen: (id: number) => void;
  onStart: (event: DragEndEvent) => void;
}): ReactElement {
  const shown = tickets.filter((ticket) => !leftBoard(ticket, now));
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
              tickets={shown.filter((ticket) => ticket.board === status)}
              config={config}
              onOpen={onOpen}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

export function Board({
  project,
  onOpen,
}: {
  project: PublicProject;
  onOpen: (id: number) => void;
}): ReactElement {
  const tickets = useQuery({
    queryKey: ['tickets', project.id],
    queryFn: () => api.tickets(project.id),
  });
  const { start, error } = useStartOnDrop();
  return (
    <BoardView
      tickets={tickets.data ?? []}
      now={tickets.dataUpdatedAt}
      error={error ?? tickets.error}
      config={project.config}
      onOpen={onOpen}
      onStart={start}
    />
  );
}
