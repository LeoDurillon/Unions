// The columns, filling the screen down to the bottom edge; any can fold to a strip.
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leftBoard } from '@union/core/states';
import type { ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../src/api-types';
import { api } from '../lib/api';
import { COLUMNS } from '../lib/labels';
import { useFoldedColumns } from '../lib/use-folded-columns';
import { Column, FoldedColumn } from './board-column';
import { ErrorText } from './ui';

const DRAG_DISTANCE_PX = 6;

type Config = PublicProject['config'];

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
  const columns = useFoldedColumns();
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
          {COLUMNS.map(({ status, title }) => {
            const inColumn = shown.filter((ticket) => ticket.board === status);
            const toggle = (): void => {
              columns.toggle(status);
            };
            return columns.folded(status) ? (
              <FoldedColumn key={status} title={title} count={inColumn.length} onUnfold={toggle} />
            ) : (
              <Column
                key={status}
                status={status}
                title={title}
                tickets={inColumn}
                config={config}
                onOpen={onOpen}
                onFold={toggle}
              />
            );
          })}
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
