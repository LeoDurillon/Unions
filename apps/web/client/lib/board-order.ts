// The order of a board column's cards: those that need the user first, then the newest.
import type { TicketSummary } from '../../src/api-types';
import { needsYou } from './board-filter';

type Orderable = Pick<TicketSummary, 'id'> & Parameters<typeof needsYou>[0];

/** Needs you first; then newest first (the higher id), so what came in last is on top. */
export function orderColumn<T extends Orderable>(tickets: readonly T[]): T[] {
  return tickets.toSorted((a, b) => {
    const waits = Number(needsYou(b)) - Number(needsYou(a));
    return waits === 0 ? b.id - a.id : waits;
  });
}
