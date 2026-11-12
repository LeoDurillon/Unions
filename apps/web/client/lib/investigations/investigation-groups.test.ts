import { expect, test } from 'bun:test';

import { groupByWeek, searchInvestigations, shortDate } from './investigation-groups';

/** Thursday, November 12, 2026, 3 PM local time. */
const NOW = new Date(2026, 10, 12, 15).getTime();

function at(month: number, day: number, year = 2026): number {
  return new Date(year, month, day, 10).getTime();
}

test('investigations fall into this week, last week, then their month', () => {
  const items = [
    { title: 'a', createdAt: at(10, 12) },
    { title: 'b', createdAt: at(10, 9) },
    { title: 'c', createdAt: at(10, 6) },
    { title: 'd', createdAt: at(10, 2) },
    { title: 'e', createdAt: at(9, 29) },
  ];
  const groups = groupByWeek(items, NOW).map((group) => [
    group.label,
    group.items.map((item) => item.title),
  ]);
  expect(groups).toEqual([
    ['This week', ['a', 'b']],
    ['Last week', ['c', 'd']],
    ['October 2026', ['e']],
  ]);
});

test('dates read short: today, yesterday, then the day, with the year when not this one', () => {
  expect(shortDate(at(10, 12), NOW)).toBe('Today');
  expect(shortDate(at(10, 11), NOW)).toBe('Yesterday');
  expect(shortDate(at(10, 6), NOW)).toBe('Nov 6');
  expect(shortDate(at(10, 6, 2025), NOW)).toBe('Nov 6, 2025');
});

test('the search keeps the titles holding every word, in any case', () => {
  const items = [
    { title: 'SSR et reverse proxy', createdAt: 0 },
    { title: 'ExcelJS vs xlsx', createdAt: 0 },
  ];
  expect(searchInvestigations(items, 'proxy ssr').map((item) => item.title)).toEqual([
    'SSR et reverse proxy',
  ]);
  expect(searchInvestigations(items, '  ')).toHaveLength(2);
});
