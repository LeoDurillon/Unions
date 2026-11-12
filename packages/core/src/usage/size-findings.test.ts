import { expect, test } from 'bun:test';

import { sizeFindings } from './size-findings';

test("each ticket's first measure with a budget counts; within the tolerance it is no finding", () => {
  expect(
    sizeFindings([
      { ticketId: 1, code: 400, budget: 100, phase: 'implemented' },
      { ticketId: 1, code: 120, budget: 100, phase: 'trimmed' },
      { ticketId: 1, code: 90, budget: 100, phase: 'implemented' },
      { ticketId: 2, code: 150, budget: 100, phase: 'implemented' },
      { ticketId: 3, code: 900, budget: null, phase: 'implemented' },
    ]),
  ).toEqual([
    {
      kind: 'over_estimate',
      actor: 'union',
      items: [{ label: '', value: 400, calls: 400, tickets: [1] }],
    },
  ]);
  expect(sizeFindings([])).toEqual([]);
});
