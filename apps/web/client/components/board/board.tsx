// The board: its search and filters, what needs the user, then the columns down to the bottom edge.
// Any column can fold to a strip; Start moves a card at once.

import { useQuery } from '@tanstack/react-query';
import { leftBoard } from '@union/core/states';
import { useState, type ReactElement } from 'react';

import type { PublicProject, TicketSummary } from '../../../src/api-types';
import { api } from '../../lib/app/api';
import { filterTickets, isFiltering, NO_FILTER } from '../../lib/board/board-filter';
import { asStarted, useStartTickets, type StartState } from '../../lib/board/use-start-tickets';
import { ErrorText } from '../ui/ui';
import { BoardColumns } from './board-column';
import { BoardTop } from './board-top';

type Config = PublicProject['config'];

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
  started,
  loading = false,
}: {
  tickets: TicketSummary[];
  /** The project's flows, to name a ticket's on its card. */
  config?: Config;
  /** When the tickets were read: Merged / Closed drops those that ended three weeks before. */
  now: number;
  error: Error | null;
  onOpen: (id: number) => void;
  /** A backlog card's Start button and what it started; none behind the first-run wizard. */
  started?: StartState;
  /** The tickets are not read yet: placeholder cards, not the empty columns' texts. */
  loading?: boolean;
}): ReactElement {
  const onBoard = asStarted(
    tickets.filter((ticket) => !leftBoard(ticket, now)),
    started?.starting ?? new Set(),
  );
  const [filter, setFilter] = useState(NO_FILTER);
  const shown = filterTickets(onBoard, filter);
  return (
    <div className="flex h-full flex-col gap-4 px-5 pt-4 pb-4">
      <BoardTop
        tickets={onBoard}
        shown={shown.length}
        filter={filter}
        onFilter={setFilter}
        onOpen={onOpen}
      />
      <ErrorText error={error} />
      <BoardColumns
        tickets={shown}
        config={config}
        filtering={isFiltering(filter)}
        loading={loading}
        onOpen={onOpen}
        started={started}
      />
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
  const started = useStartTickets();
  return (
    <BoardView
      tickets={tickets.data ?? []}
      now={tickets.dataUpdatedAt}
      error={tickets.error}
      config={project.config}
      onOpen={onOpen}
      started={started}
      loading={tickets.isPending}
    />
  );
}
