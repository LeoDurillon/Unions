import { expect, test } from 'bun:test';

import type { TicketDetail } from '../../../src/api-types';
import { progressOf } from './ticket-progress';

const MINUTE = 60_000;

function detail(
  phase: object,
  outputs: [string, string][],
  prState: string | null = null,
): TicketDetail {
  return {
    ticket: { flow: ['implement', 'final_review'], phase, prState },
    project: { config: { baseBranch: 'main' } },
    outputs: outputs.map(([step, content]) => ({ step, content })),
    runs: [
      { step: 'implement', startedAt: 0, finishedAt: 20 * MINUTE },
      { step: 'implement', startedAt: 0, finishedAt: 4 * MINUTE },
    ],
  } as unknown as TicketDetail;
}

test('a final review asking for changes waits, after the implementation it reviewed', () => {
  const ticket = detail({ kind: 'awaiting_approval', step: 'final_review' }, [
    ['implement', 'v1'],
    ['implement', 'v2'],
    ['final_review', 'VERDICT: CHANGES_REQUESTED\n\nTwo findings.'],
  ]);
  expect(progressOf(ticket, {}).map(({ label, state, note }) => [label, state, note])).toEqual([
    ['Implementation', 'done', 'v2 · 24m'],
    ['Final review', 'waiting', 'Changes requested'],
    ['Done', 'todo', 'PR ready'],
    ['Merged', 'todo', 'On GitHub'],
  ]);
});

test('a step after the one running again waits, even though it ran before', () => {
  const ticket = detail({ kind: 'running', step: 'implement' }, [
    ['implement', 'v1'],
    ['final_review', 'VERDICT: CHANGES_REQUESTED'],
  ]);
  expect(
    progressOf(ticket, {})
      .slice(0, 2)
      .map(({ state, note }) => [state, note]),
  ).toEqual([
    ['running', 'Running'],
    ['todo', 'Runs again'],
  ]);
});

test('a merged ticket reaches every stop; a cancelled one ends on Cancelled', () => {
  const merged = detail(
    { kind: 'done' },
    [
      ['implement', 'v1'],
      ['final_review', 'ok'],
    ],
    'merged',
  );
  expect(progressOf(merged, {}).every((stop) => stop.state === 'done')).toBe(true);
  const cancelled = detail({ kind: 'cancelled' }, [['implement', 'v1']]);
  expect(progressOf(cancelled, {}).map((stop) => stop.label)).toEqual([
    'Implementation',
    'Final review',
    'Cancelled',
  ]);
});
