// The board: its search and filters, then the columns down to the bottom edge; any can fold to a strip.
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leftBoard } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { api } from '../lib/api';
import { filterTickets, isFiltering, NO_FILTER } from '../lib/board-filter';
import { BoardColumns } from './board-column';
import { BoardToolbar } from './board-toolbar';
import { ErrorText } from './ui';

const DRAG_DISTANCE_PX = 6;

type Config = PublicProject['config'];

/** Starting a backlog ticket: dropped into In progress, or its Start button. */
function useStart(): {
  onDrop: (event: DragEndEvent) => void;
  start: (ticketId: number) => void;
  error: Error | null;
} {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (ticketId: number) => api.command(ticketId, 'start'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });
  const onDrop = (event: DragEndEvent): void => {
    if (event.over?.id === 'in_progress' && typeof event.active.id === 'number') {
      mutation.mutate(event.active.id);
    }
  };
  return { onDrop, start: mutation.mutate, error: mutation.error };
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
  onDrop,
  onStart,
}: {
  tickets: TicketSummary[];
  /** The project's flows, to name a ticket's on its card. */
  config?: Config;
  /** When the tickets were read: Merged / Closed drops those that ended three weeks before. */
  now: number;
  error: Error | null;
  onOpen: (id: number) => void;
  onDrop: (event: DragEndEvent) => void;
  /** A backlog card's Start button; none behind the first-run wizard. */
  onStart?: (id: number) => void;
}): ReactElement {
  const onBoard = tickets.filter((ticket) => !leftBoard(ticket, now));
  const [filter, setFilter] = useState(NO_FILTER);
  const shown = filterTickets(onBoard, filter);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }),
  );
  return (
    <div className="flex h-full flex-col gap-3 px-4 pt-3 pb-4">
      <BoardToolbar
        tickets={onBoard}
        shown={shown.length}
        filter={filter}
        onFilter={setFilter}
        canStart={onStart !== undefined}
      />
      <ErrorText error={error} />
      <DndContext sensors={sensors} onDragEnd={onDrop}>
        <BoardColumns
          tickets={shown}
          config={config}
          filtering={isFiltering(filter)}
          onOpen={onOpen}
          onStart={onStart}
        />
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
  const { onDrop, start, error } = useStart();
  return (
    <BoardView
      tickets={tickets.data ?? []}
      now={tickets.dataUpdatedAt}
      error={error ?? tickets.error}
      config={project.config}
      onOpen={onOpen}
      onDrop={onDrop}
      onStart={start}
    />
  );
}
