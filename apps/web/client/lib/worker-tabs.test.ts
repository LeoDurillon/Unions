import { expect, test } from 'bun:test';

import type { TicketDetail } from '../../src/api-types';
import { latestWorkerTab, workerTabsFor } from './worker-tabs';

function detail(flow: string[], ran: string[]): TicketDetail {
  return {
    ticket: { flow, phase: { kind: 'awaiting_approval', step: ran.at(-1) } },
    project: { config: { baseBranch: 'main' } },
    outputs: ran.map((step) => ({ step })),
  } as unknown as TicketDetail;
}

test("a custom step's tab sits where the flow runs it, named after its agent", () => {
  const ticket = detail(
    ['technical', 'agent_1', 'implement', 'final_review'],
    ['technical', 'agent_1'],
  );
  expect(workerTabsFor(ticket, { agent_1: 'Security pass' }).map((tab) => tab.label)).toEqual([
    'Technical',
    'Security pass',
    'Implementation',
    'Final review',
    'Log',
  ]);
  expect(latestWorkerTab(ticket)).toBe('agent_1');
});

test('a skipped step that ran before goes back before the next built-in step', () => {
  const ticket = detail(['agent_1', 'implement', 'final_review'], ['intake', 'agent_1']);
  expect(workerTabsFor(ticket, {}).map((tab) => tab.id)).toEqual([
    'agent_1',
    'intake',
    'implement',
    'final_review',
    'log',
  ]);
});
