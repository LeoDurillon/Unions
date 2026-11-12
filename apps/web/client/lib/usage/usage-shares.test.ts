import { expect, test } from 'bun:test';

import { modelFamily, shareOf, topModel } from './usage-shares';

test('a row is measured against the costliest one', () => {
  const rows = [{ costUsd: 625.38 }, { costUsd: 157.59 }, { costUsd: 0.46 }, { costUsd: 0 }];
  expect(rows.map((row) => shareOf(row, rows))).toEqual([100, 25, 1, 0]);
  expect(shareOf({ costUsd: 0 }, [{ costUsd: 0 }])).toBe(0);
});

test('the model most calls ran on, by family', () => {
  expect(modelFamily('claude-opus-5-5')).toBe('Opus');
  expect(modelFamily('gpt-x')).toBe('gpt-x');
  expect(
    topModel([
      { model: 'claude-opus-5-5', calls: 600 },
      { model: 'claude-opus-4-1', calls: 3 },
      { model: 'claude-haiku-5-5', calls: 86 },
    ]),
  ).toBe('603 on Opus');
  expect(topModel([])).toBeNull();
});
