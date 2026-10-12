import { expect, test } from 'bun:test';

import { claudeArgs } from './agent';

const run = { model: 'opus', tools: ['Read'], denied: [], resumeSessionId: null };

test('the effort is passed to the CLI only when one is set', () => {
  const flags = claudeArgs({ ...run, effort: 'xhigh' });
  expect(flags[flags.indexOf('--model') + 1]).toBe('opus');
  expect(flags[flags.indexOf('--effort') + 1]).toBe('xhigh');
  expect(claudeArgs({ ...run, effort: null })).not.toContain('--effort');
  expect(claudeArgs(run)).not.toContain('--effort');
});
