import { expect, test } from 'bun:test';

import { groupRuns } from './log-runs';

test('the log splits at each run header; lines before the first run get a run of their own', () => {
  const entries = ['a', 'run1', 'b', 'c', 'run2'].map((key) => ({ key }));
  const runs = groupRuns(entries, (entry) => entry.key.startsWith('run'));
  expect(runs.map((run) => [run.key, run.lines.map((line) => line.key)])).toEqual([
    ['before', ['a']],
    ['run1', ['b', 'c']],
    ['run2', []],
  ]);
});
