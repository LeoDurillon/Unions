// The `adopt` action: a ticket imported from a pull request starts waiting for approval at implementation.
import { expect, test } from 'bun:test';

import { InvalidTransition, transition, type Flow } from './states';

const QUICK: Flow = ['implement', 'final_review'];

test('adopt waits for approval at implementation, then Revise or Approve go on as usual', () => {
  const adopted = transition({ kind: 'backlog' }, { type: 'adopt' }, QUICK);
  expect(adopted).toEqual({ kind: 'awaiting_approval', step: 'implement' });
  expect(transition(adopted, { type: 'revise' }, QUICK)).toEqual({
    kind: 'running',
    step: 'implement',
  });
  expect(transition(adopted, { type: 'approve' }, QUICK)).toEqual({
    kind: 'running',
    step: 'final_review',
  });
});

test('adopt is refused once the ticket left the backlog', () => {
  const running = transition({ kind: 'backlog' }, { type: 'start' }, QUICK);
  expect(() => transition(running, { type: 'adopt' }, QUICK)).toThrow(InvalidTransition);
});
