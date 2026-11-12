import { expect, test } from 'bun:test';

import type { TicketSummary } from '../../../src/api-types';
import { orderColumn } from './board-order';

function ticket(id: number, kind: string, checks: string | null = null): TicketSummary {
  return {
    id,
    phase: { kind },
    prState: checks === null ? null : 'open',
    prChecksState: checks,
  } as unknown as TicketSummary;
}

test('the tickets that need the user come first, then the newest', () => {
  const ordered = orderColumn([
    ticket(1, 'done'),
    ticket(2, 'done', 'failure'),
    ticket(3, 'done'),
    ticket(4, 'awaiting_approval'),
  ]);
  expect(ordered.map((entry) => entry.id)).toEqual([4, 2, 3, 1]);
});
