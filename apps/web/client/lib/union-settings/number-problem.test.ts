// Tests the whole-number checks of the Union settings pages: empty, decimal, out of range and valid values.

import { expect, test } from 'bun:test';

import { firstNumberProblem, numberProblem, parseTyped } from './number-problem';

const BOUNDS = { min: 1, max: 16 };

test('an emptied field is not a number, not 0', () => {
  expect(parseTyped('')).toBeNaN();
  expect(parseTyped('  ')).toBeNaN();
  expect(parseTyped('4')).toBe(4);
});

test('says why a value cannot be saved', () => {
  expect(numberProblem('Runs', Number.NaN, BOUNDS)).toBe('Runs: enter a number.');
  expect(numberProblem('Runs', 1.5, BOUNDS)).toBe('Runs: enter a whole number.');
  expect(numberProblem('Runs', 0, BOUNDS)).toBe('Runs: enter a number from 1 to 16.');
  expect(numberProblem('Runs', 17, BOUNDS)).toBe('Runs: enter a number from 1 to 16.');
  expect(numberProblem('Runs', 16, BOUNDS)).toBeNull();
});

test('the first field with a problem wins', () => {
  expect(
    firstNumberProblem([
      { label: 'A', value: 2, bounds: BOUNDS },
      { label: 'B', value: 0, bounds: BOUNDS },
    ]),
  ).toBe('B: enter a number from 1 to 16.');
  expect(firstNumberProblem([{ label: 'A', value: 2, bounds: BOUNDS }])).toBeNull();
});
