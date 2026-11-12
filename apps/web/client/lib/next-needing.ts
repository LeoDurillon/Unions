// The next ticket that waits on the user, in the board's order: column by column, each as it lists them.
import type { TicketSummary } from '../../src/api-types';
import { needsYou } from './board-filter';
import { orderColumn } from './board-order';
import { COLUMNS } from './labels';

type Orderable = Pick<TicketSummary, 'id' | 'board'> & Parameters<typeof needsYou>[0];

/** The tickets as the board shows them: column by column, left to right, each sorted as it lists them. */
function boardOrder<T extends Orderable>(tickets: T[]): T[] {
  return COLUMNS.flatMap(({ status }) =>
    orderColumn(tickets.filter((ticket) => ticket.board === status)),
  );
}

/** Just outside the list, on the side a walk in `step`'s direction starts from. */
function edge(count: number, step: 1 | -1): number {
  return step === 1 ? -1 : count;
}

/**
 * The ticket after (`step` 1) or before (-1) `currentId` on the board that needs the user, wrapping
 * around; from the board's start (or end) when `currentId` is null or gone. Null when no other does.
 */
export function nextNeedingYou<T extends Orderable>(
  tickets: T[],
  currentId: number | null,
  step: 1 | -1 = 1,
): T | null {
  const ordered = boardOrder(tickets);
  const count = ordered.length;
  const at = ordered.findIndex((ticket) => ticket.id === currentId);
  const from = at === -1 ? edge(count, step) : at;
  for (let offset = 1; offset <= count; offset += 1) {
    const candidate = ordered[(((from + step * offset) % count) + count) % count];
    if (candidate && candidate.id !== currentId && needsYou(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** How many tickets other than `currentId` need the user. */
export function othersNeedingYou(tickets: Orderable[], currentId: number | null): number {
  return tickets.filter((ticket) => ticket.id !== currentId && needsYou(ticket)).length;
}
