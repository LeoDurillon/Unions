import { expect, test } from 'bun:test';

import { outputComment } from './review-output-comment';

test('a failed command reads as what ran, how it ended, and its output in a block', () => {
  expect(
    outputComment({ command: 'npm test', exitCode: 1, error: null, output: 'FAIL a.test\n' }),
  ).toBe(
    'I ran `npm test` on this pull request: it exited with 1.\n\nOutput:\n\n```text\nFAIL a.test\n```',
  );
});

test('output holding backticks cannot close its block; long output keeps its end', () => {
  const output = [...Array.from({ length: 70 }, (_line, index) => `line ${index}`), '```'].join(
    '\n',
  );
  const comment = outputComment({ command: 'x', exitCode: 2, error: null, output });
  expect(comment).toContain('(the last 60 lines)');
  expect(comment).toContain('````text\nline 11\n');
  expect(comment).not.toContain('line 10\n');
  expect(comment.endsWith('line 69\n```\n````')).toBe(true);
  expect(outputComment({ command: 'echo `id`', exitCode: 0, error: null, output: '' })).toBe(
    'I ran `` echo `id` `` on this pull request: it passed.',
  );
});

test('a run stopped early says why; screenshots are mentioned, not attached', () => {
  const comment = outputComment({
    command: 'pnpm e2e',
    exitCode: null,
    error: 'Stopped after 600 s (the timeout)',
    output: '',
    screenshots: 2,
  });
  expect(comment).toBe(
    'I ran `pnpm e2e` on this pull request: it did not finish: Stopped after 600 s (the timeout).\n\n2 failure screenshot(s) were taken; I can share them.',
  );
});
