import { expect, test } from 'bun:test';

import type { TicketSummary } from '../../../src/api-types';
import { needsYouAction } from './needs-you-action';

function ticket(phase: object): TicketSummary {
  return { phase, prState: 'open', prChecksState: 'failure' } as unknown as TicketSummary;
}

test('each reason a ticket needs the user reads as what to do', () => {
  expect(needsYouAction(ticket({ kind: 'awaiting_approval', step: 'intake' }), {})).toEqual({
    text: 'Intake waits for you',
    tone: 'amber',
  });
  expect(needsYouAction(ticket({ kind: 'failed', step: 'implement', error: 'x' }), {}).text).toBe(
    'Implementation failed',
  );
  expect(needsYouAction(ticket({ kind: 'done' }), {})).toEqual({
    text: 'Checks failed',
    tone: 'red',
  });
});
