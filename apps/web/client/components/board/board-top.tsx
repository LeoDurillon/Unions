// The top of the board: its toolbar, then the tickets that need the user while no filter narrows the board.

import type { ReactElement } from 'react';

import type { TicketSummary } from '../../../src/api-types';
import { isFiltering, type BoardFilter } from '../../lib/board/board-filter';
import { BoardToolbar } from './board-toolbar';
import { NeedsYouStrip } from './needs-you-strip';

export function BoardTop({
  tickets,
  shown,
  filter,
  onFilter,
  onOpen,
}: {
  /** Every ticket on the board, before the filter. */
  tickets: TicketSummary[];
  /** How many the filter keeps. */
  shown: number;
  filter: BoardFilter;
  onFilter: (filter: BoardFilter) => void;
  onOpen: (id: number) => void;
}): ReactElement {
  return (
    <>
      <BoardToolbar
        tickets={tickets}
        shown={shown}
        filter={filter}
        onFilter={onFilter}
        onOpen={onOpen}
      />
      {/* A filter already narrows the board to what it asks: the strip would repeat it. */}
      {isFiltering(filter) ? null : (
        <NeedsYouStrip
          tickets={tickets}
          onOpen={onOpen}
          onShowAll={() => {
            onFilter({ ...filter, needsYou: true });
          }}
        />
      )}
    </>
  );
}
