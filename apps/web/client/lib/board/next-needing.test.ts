import { describe, expect, test } from 'bun:test';

import { nextNeedingYou, othersNeedingYou } from './next-needing';

type T = Parameters<typeof nextNeedingYou>[0][number];

const WAITING = { kind: 'awaiting_approval', step: 'intake' } as const;

function ticket(id: number, board: T['board'], waits: boolean): T {
  return {
    id,
    board,
    title: `Ticket ${id}`,
    issueNumber: id,
    prNumber: null,
    phase: waits ? WAITING : { kind: 'backlog' },
    prState: null,
    prChecksState: null,
    originKind: null,
  };
}

// Listed out of board order: 4 is in review, 2 in progress, so the board shows 1, 2, 4, 3, 5.
const tickets = [
  ticket(1, 'backlog', false),
  ticket(4, 'in_review', true),
  ticket(2, 'in_progress', true),
  ticket(3, 'in_review', false),
  ticket(5, 'done', true),
];

describe('nextNeedingYou', () => {
  test('goes column by column, skipping tickets that do not wait', () => {
    expect(nextNeedingYou(tickets, null)?.id).toBe(2);
    expect(nextNeedingYou(tickets, 2)?.id).toBe(4);
    expect(nextNeedingYou(tickets, 4)?.id).toBe(5);
  });

  test('wraps around, both ways', () => {
    expect(nextNeedingYou(tickets, 5)?.id).toBe(2);
    expect(nextNeedingYou(tickets, 2, -1)?.id).toBe(5);
    expect(nextNeedingYou(tickets, null, -1)?.id).toBe(5);
  });

  test('starts after a ticket that no longer waits (just approved)', () => {
    expect(nextNeedingYou(tickets, 3)?.id).toBe(5);
    expect(nextNeedingYou(tickets, 3, -1)?.id).toBe(4);
  });

  test('null when no other ticket waits', () => {
    expect(nextNeedingYou([ticket(1, 'backlog', true)], 1)).toBeNull();
    expect(nextNeedingYou([], null)).toBeNull();
  });
});

describe('othersNeedingYou', () => {
  test('counts the waiting tickets but the open one', () => {
    expect(othersNeedingYou(tickets, 4)).toBe(2);
    expect(othersNeedingYou(tickets, null)).toBe(3);
  });
});
