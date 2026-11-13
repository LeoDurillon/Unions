// Tests reading a typed value as the user does: people by name, a box as Yes or No, the rest as typed.
import { expect, test } from 'bun:test';

import { notionValueText } from './tracker-value-text';

test('people read by name, an unknown id as itself', () => {
  expect(notionValueText('people', 'u1, u9', [{ id: 'u1', name: 'Ada' }])).toBe('Ada, u9');
});

test('a box reads Yes or No, other values as typed', () => {
  expect(notionValueText('checkbox', 'true', [])).toBe('Yes');
  expect(notionValueText('checkbox', 'false', [])).toBe('No');
  expect(notionValueText('select', ' P1 ', [])).toBe('P1');
});
