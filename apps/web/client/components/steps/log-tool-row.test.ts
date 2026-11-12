import { expect, test } from 'bun:test';

import { resultSummary } from './log-tool-row';

test("a call's result line: its first line, a failure, or that it still runs", () => {
  expect(resultSummary()).toBeNull();
  expect(resultSummary({ id: 'a', input: '{}' })).toBe('running…');
  expect(resultSummary({ id: 'a', output: '\n  142 lines\nmore' })).toBe('142 lines');
  expect(resultSummary({ id: 'a', output: 'exit 1', failed: true })).toBe('failed: exit 1');
  expect(resultSummary({ id: 'a', output: '' })).toBe('no output');
});
