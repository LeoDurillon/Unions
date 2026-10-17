import { expect, test } from 'bun:test';

import {
  botCommentText,
  failedCheckText,
  jobLogTail,
  MAX_CI_LOG_LINES,
  MAX_CI_TEXT_CHARS,
  relatedJobText,
  type FailedCheck,
} from './ci-output-text';

/** Shaped like a real GitHub Actions job log: a timestamp per line, setup groups, steps, cleanup. */
const LOG = [
  '2026-10-16T15:24:37.4790839Z Current runner version: 2.329.0',
  '2026-10-16T15:24:37.4828979Z ##[group]Runner Image Provisioner',
  '2026-10-16T15:24:37.4829000Z Hosted Compute Agent',
  '2026-10-16T15:24:37.4830000Z ##[endgroup]',
  '2026-10-16T15:24:37.4840000Z ##[group]GITHUB_TOKEN Permissions',
  '2026-10-16T15:24:37.4841000Z Contents: read',
  '2026-10-16T15:24:37.4842000Z ##[endgroup]',
  '2026-10-16T15:24:38.1000000Z ##[group]Run bun install',
  '2026-10-16T15:24:38.1000100Z \u001B[36;1mbun install\u001B[0m',
  '2026-10-16T15:24:38.1000200Z ##[endgroup]',
  '2026-10-16T15:24:38.2000000Z ##[start-action display=Install;id=__self.__run]',
  '2026-10-16T15:24:39.0000000Z 312 packages installed',
  '2026-10-16T15:24:39.1000000Z ##[end-action id=__self.__run;outcome=success]',
  '2026-10-16T15:24:40.0000000Z ##[group]Run bun test',
  '2026-10-16T15:24:40.0000100Z bun test',
  '2026-10-16T15:24:40.0000200Z ##[endgroup]',
  '2026-10-16T15:24:41.0000000Z src/a.test.ts:',
  '2026-10-16T15:24:41.0000100Z (fail) adds > two numbers',
  '2026-10-16T15:24:41.0000200Z ##[error]Process completed with exit code 1.',
  '2026-10-16T15:24:42.0000000Z Post job cleanup.',
  '2026-10-16T15:24:42.0000100Z Cleaning up orphan processes',
].join('\n');

const CHECK: FailedCheck = {
  name: 'Tests',
  conclusion: 'failure',
  url: 'https://github.com/o/r/actions/runs/1/job/2',
  output: { title: null, summary: null, text: null },
  annotations: [
    {
      path: '.github',
      startLine: 7,
      level: 'failure',
      message: 'Process completed with exit code 1.',
    },
    {
      path: '.github',
      startLine: 1,
      level: 'notice',
      message: 'The ubuntu-latest label will migrate',
    },
    { path: 'src/a.test.ts', startLine: 12, level: 'failure', message: 'expected 3, got 4' },
  ],
  log: LOG,
};

test('the failed step only: no setup, no other step, no cleanup, markers as plain text', () => {
  expect(jobLogTail(LOG, true)).toBe(
    [
      'Run bun test',
      'src/a.test.ts:',
      '(fail) adds > two numbers',
      'Error: Process completed with exit code 1.',
    ].join('\n'),
  );
});

test('every step for another job, without the scripts the groups echo nor action markers', () => {
  const tail = jobLogTail(LOG, false);
  expect(tail.startsWith('Run bun install\n312 packages installed\nRun bun test\n')).toBe(true);
  expect(tail).not.toContain('Runner Image');
  expect(tail).not.toContain('Post job cleanup');
});

test('a log without steps or errors is kept whole, cut to its last lines', () => {
  const lines = Array.from({ length: MAX_CI_LOG_LINES + 5 }, (_, i) => `line ${i}`);
  const tail = jobLogTail(lines.join('\n'), true);
  expect(tail.startsWith('(5 earlier lines cut)\nline 5\n')).toBe(true);
  expect(tail.endsWith(`line ${MAX_CI_LOG_LINES + 4}`)).toBe(true);
});

test('a failed check: heading, link, annotations without notices or exit code, the step log', () => {
  const text = failedCheckText(CHECK);
  expect(text).toStartWith(
    '## Failed check: Tests (failure)\nhttps://github.com/o/r/actions/runs/1/job/2\n',
  );
  expect(text).toContain('Annotations:\n- src/a.test.ts:12: failure: expected 3, got 4\n');
  expect(text).not.toContain('ubuntu-latest');
  expect(text).toContain('Log of the failed step:\n```text\nRun bun test\n');
  expect(text.endsWith('Error: Process completed with exit code 1.\n```')).toBe(true);
});

test('other CI: its summary and no log', () => {
  const text = failedCheckText({
    ...CHECK,
    url: null,
    annotations: [],
    log: null,
    output: { title: '2 failed', summary: 'lint: 2 errors', text: null },
  });
  expect(text).toBe('## Failed check: Tests (failure)\n\n2 failed\n\nlint: 2 errors\n');
});

test('a log with backticks gets a longer fence', () => {
  const text = relatedJobText({ name: 'Knip', url: null, log: 'knip\n```ts\nunused\n```' });
  expect(text).toContain('````text\nknip\n```ts');
});

test('a long log loses its start, the header stays, within the limit', () => {
  const long = Array.from({ length: MAX_CI_LOG_LINES }, () => 'x'.repeat(200)).join('\n');
  const text = failedCheckText({ ...CHECK, log: long });
  expect(text.length).toBeLessThanOrEqual(MAX_CI_TEXT_CHARS);
  expect(text).toStartWith('## Failed check: Tests');
});

test('a bot comment, its body trimmed', () => {
  expect(
    botCommentText({ author: 'github-actions[bot]', url: 'https://x/1', body: ' # Report\n' }),
  ).toBe('## Comment by github-actions[bot] on the pull request\nhttps://x/1\n\n# Report');
});
