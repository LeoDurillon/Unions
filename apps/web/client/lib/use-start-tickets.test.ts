// Tests of how the board shows tickets being started: In progress at once, others as they are.
import { expect, test } from 'bun:test';

import type { TicketSummary } from '../../src/api-types';
import { asStarted } from './use-start-tickets';

const ticket = (id: number, board: TicketSummary['board']): TicketSummary =>
  ({ id, board }) as unknown as TicketSummary;

test('a ticket being started shows In progress; others, and one already moved on, stay where they are', () => {
  const shown = asStarted(
    [ticket(1, 'backlog'), ticket(2, 'backlog'), ticket(3, 'in_review')],
    new Set([1, 3]),
  );
  expect(shown.map((each) => each.board)).toEqual(['in_progress', 'backlog', 'in_review']);
});
