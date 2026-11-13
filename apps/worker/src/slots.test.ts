// Tests of the run slots: a fixed cap, and a cap read on every take so a changed setting applies at once.
import { expect, test } from 'bun:test';

import { RunSlots } from './slots';

test('a fixed cap refuses past it, and frees on release', () => {
  const slots = new RunSlots(1);
  expect(slots.tryTake()).toBe(true);
  expect(slots.tryTake()).toBe(false);
  slots.release();
  expect(slots.tryTake()).toBe(true);
});

test('a cap read on every take follows its setting', () => {
  let max = 1;
  const slots = new RunSlots(() => max);
  expect(slots.tryTake()).toBe(true);
  expect(slots.tryTake()).toBe(false);
  max = 2;
  expect(slots.tryTake()).toBe(true);
  max = 1;
  slots.release();
  expect(slots.tryTake()).toBe(false);
});
