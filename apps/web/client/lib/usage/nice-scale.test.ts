import { expect, test } from 'bun:test';

import { niceTicks } from './nice-scale';

test('round ticks just above the largest value', () => {
  expect(niceTicks(918)).toEqual([0, 250, 500, 750, 1000]);
  expect(niceTicks(3.2)).toEqual([0, 1, 2, 3, 4]);
  expect(niceTicks(100)).toEqual([0, 25, 50, 75, 100]);
  expect(niceTicks(0.04)).toEqual([0, 0.01, 0.02, 0.03, 0.04]);
});

test('nothing to show: one unit', () => {
  expect(niceTicks(0)).toEqual([0, 1]);
});
