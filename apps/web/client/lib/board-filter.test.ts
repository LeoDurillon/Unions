import { describe, expect, test } from 'bun:test';

import { filterTickets, needsYou, NO_FILTER } from './board-filter';

type T = Parameters<typeof needsYou>[0];

function ticket(over: Partial<T>): T {
  return {
    title: 'Fix the export',
    issueNumber: 12,
    prNumber: null,
    phase: { kind: 'backlog' },
    prState: null,
    prChecksState: null,
    originKind: null,
    ...over,
  };
}

describe('needsYou', () => {
  test('an approval, a failure and red checks need the user; a running step does not', () => {
    expect(needsYou(ticket({ phase: { kind: 'awaiting_approval', step: 'intake' } }))).toBe(true);
    expect(needsYou(ticket({ prState: 'open', prChecksState: 'failure' }))).toBe(true);
    expect(needsYou(ticket({ phase: { kind: 'running', step: 'implement' } }))).toBe(false);
  });
});

describe('filterTickets', () => {
  const tickets = [
    ticket({ title: 'Fix the CSV export', issueNumber: 12 }),
    ticket({ title: 'Seuil RFR', issueNumber: 30, prNumber: 31, originKind: 'notion' }),
  ];

  test('every word of the text must match the title or a number', () => {
    expect(filterTickets(tickets, { ...NO_FILTER, text: 'csv export' })).toHaveLength(1);
    expect(filterTickets(tickets, { ...NO_FILTER, text: '#31' })[0]?.title).toBe('Seuil RFR');
  });

  test('the origin keeps Notion imports, or the others', () => {
    expect(filterTickets(tickets, { ...NO_FILTER, origin: 'notion' })).toHaveLength(1);
    expect(filterTickets(tickets, { ...NO_FILTER, origin: 'github' })[0]?.title).toBe(
      'Fix the CSV export',
    );
  });
});
