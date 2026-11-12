import { expect, test } from 'bun:test';

import { filterPulls, isPullFiltering, NO_PULL_FILTER } from './pull-request-filter';

const PULLS = [
  {
    number: 1743,
    title: 'add the customer order review page',
    headBranch: 'goreno/16/order-review',
    draft: false,
    ticketId: null,
  },
  {
    number: 1739,
    title: 'add a signature pad',
    headBranch: 'simulator/16/add-order-signature-pad',
    draft: true,
    ticketId: null,
  },
  {
    number: 1742,
    title: '[Prêts] Ajout de règles',
    headBranch: '1741-prets-ajout',
    draft: false,
    ticketId: 54,
  },
];

function numbers(filter: Partial<typeof NO_PULL_FILTER>): number[] {
  return filterPulls(PULLS, { ...NO_PULL_FILTER, ...filter }).map((pull) => pull.number);
}

test('the search reads the title, the number and the branch', () => {
  expect(numbers({ text: 'ORDER' })).toEqual([1743, 1739]);
  expect(numbers({ text: '#1742' })).toEqual([1742]);
  expect(numbers({ text: 'simulator pad' })).toEqual([1739]);
});

test('with a ticket keeps the linked ones; drafts hidden drops the drafts', () => {
  expect(numbers({ withTicket: true })).toEqual([1742]);
  expect(numbers({ hideDrafts: true })).toEqual([1743, 1742]);
  expect(isPullFiltering(NO_PULL_FILTER)).toBe(false);
  expect(isPullFiltering({ ...NO_PULL_FILTER, hideDrafts: true })).toBe(true);
});
