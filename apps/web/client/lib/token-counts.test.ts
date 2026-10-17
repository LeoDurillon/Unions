// Tests how the Log writes token counts, and a run's total over its calls.
import { expect, test } from 'bun:test';

import { count, sumTokens, tokensText, type CallTokens } from './token-counts';

const call: CallTokens = {
  input: 10,
  cacheRead: 900,
  cacheWrite: 90,
  output: 1500,
  thinking: 0,
  turns: 1,
};

test('counts are short', () => {
  expect([count(950), count(5687), count(308_012), count(4_100_000)]).toEqual([
    '950',
    '5.7k',
    '308k',
    '4.1M',
  ]);
});

test('a call reads as its turns, input with the cached share, and output', () => {
  expect(tokensText(call)).toBe('1 turn · 1.0k in (90% cached) · 1.5k out');
  expect(tokensText({ ...call, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 })).toBe('');
});

test('a run’s total adds its calls up', () => {
  expect(sumTokens([call, { ...call, thinking: 200, turns: 3 }])).toEqual({
    input: 20,
    cacheRead: 1800,
    cacheWrite: 180,
    output: 3000,
    thinking: 200,
    turns: 4,
  });
});
