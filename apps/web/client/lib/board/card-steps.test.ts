import { expect, test } from 'bun:test';

import type { PublicProject, TicketSummary } from '../../../src/api-types';
import { cardSegments } from './card-steps';

const CONFIG = { baseBranch: 'main' } as unknown as PublicProject['config'];

function states(phase: object): string[] | undefined {
  const ticket = {
    phase,
    flow: ['technical', 'implement', 'final_review'],
  } as unknown as TicketSummary;
  return cardSegments(ticket, CONFIG, {})?.map((segment) => segment.state);
}

test('the steps before the current one are done, the current shows its state, the rest wait', () => {
  expect(states({ kind: 'awaiting_approval', step: 'implement' })).toEqual([
    'done',
    'waiting',
    'todo',
  ]);
  expect(states({ kind: 'failed', step: 'technical', error: 'x' })).toEqual([
    'stalled',
    'todo',
    'todo',
  ]);
});

test('a done ticket, or one on a step outside its flow, has every step behind it', () => {
  expect(states({ kind: 'done' })).toEqual(['done', 'done', 'done']);
  expect(states({ kind: 'running', step: 'rebase' })).toEqual(['done', 'done', 'done']);
});

test('nothing to show in Backlog or once cancelled', () => {
  expect(states({ kind: 'backlog' })).toBeUndefined();
  expect(states({ kind: 'cancelled' })).toBeUndefined();
});
