// Tests how the Usage tables write tokens, costs and the peak context.
import { expect, test } from 'bun:test';

import { costText, inputText, outputText, peakText } from './usage-format';

const tokens = { input: 10, cacheRead: 900, cacheWrite: 90, output: 5687, thinking: 1209 };

test('input shows its cached share, output its thinking', () => {
  expect(inputText(tokens)).toBe('1.0k (90% cached)');
  expect(inputText({ ...tokens, input: 0, cacheRead: 0, cacheWrite: 0 })).toBe('0');
  expect(outputText(tokens)).toBe('5.7k (1.2k thinking)');
  expect(outputText({ ...tokens, thinking: 0 })).toBe('5.7k');
});

test('costs are in dollars, tiny ones and unknown ones apart', () => {
  expect([costText(1.234), costText(0.004), costText(0), costText(null)]).toEqual([
    '$1.23',
    '<$0.01',
    '$0.00',
    '–',
  ]);
});

test('a peak past 80% of the window is high', () => {
  expect(peakText(410_852, 1_000_000)).toEqual({ text: '411k / 1.0M', high: false });
  expect(peakText(850_000, 1_000_000)?.high).toBe(true);
  expect(peakText(null, 1_000_000)).toBeNull();
});
