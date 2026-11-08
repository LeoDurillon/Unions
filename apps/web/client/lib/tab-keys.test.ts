// Tests of where the arrow keys move in a tab bar.
import { expect, test } from 'bun:test';

import { nextTabIndex } from './tab-keys';

test('Left and Right move by one and wrap; Home and End go to the ends', () => {
  expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1);
  expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
  expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
  expect(nextTabIndex('Home', 2, 3)).toBe(0);
  expect(nextTabIndex('End', 0, 3)).toBe(2);
});

test('other keys, and an empty bar, move nowhere', () => {
  expect(nextTabIndex('Enter', 1, 3)).toBeNull();
  expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull();
});
