// Tests reading what an agent review opened of the change from its log.

import { expect, test } from 'bun:test';

import { commandShown, reviewCoverage, type ReviewedFile } from './agent-review-coverage';

const REPO = '/workspace/repo';

const FILES: ReviewedFile[] = [
  { path: 'api/a.ts', lines: 40 },
  { path: 'api/b.ts', lines: 10 },
  { path: 'web/c.tsx', lines: 30 },
  { path: 'docs/d.md', lines: 5 },
  { path: 'img.png', lines: 0 },
];

function toolUse(id: string, name: string, input: Record<string, unknown>): unknown {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } };
}

function result(id: string, content: unknown, isError = false): unknown {
  return {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
  };
}

function bash(id: string, command: string, output = 'ok'): unknown[] {
  return [toolUse(id, 'Bash', { command }), result(id, output)];
}

function unopened(events: unknown[]): string[] {
  return reviewCoverage(events, FILES, REPO).unopened.map((file) => file.path);
}

test('a diff of a folder or a file opens what it names; a summary opens nothing', () => {
  const events = [
    ...bash('1', 'git diff origin/main...HEAD --stat'),
    ...bash('2', 'git diff origin/main...HEAD -- api'),
    ...bash('3', 'git diff --name-only origin/main...HEAD -- web/c.tsx'),
  ];
  expect(unopened(events)).toEqual(['web/c.tsx', 'docs/d.md']);
});

test('a whole diff opens everything; files without changed lines are not counted', () => {
  const coverage = reviewCoverage(bash('1', 'git diff origin/main...HEAD'), FILES, REPO);
  expect(coverage).toEqual({ files: 4, lines: 85, unopened: [] });
});

test('reading or printing a file opens it, from the repository root or by its full path', () => {
  const events = [
    toolUse('1', 'Read', { file_path: `${REPO}/web/c.tsx`, offset: 10, limit: 20 }),
    ...bash('2', `sed -n 1,40p ${REPO}/docs/d.md`),
    ...bash('3', 'cat "api/b.ts"'),
    toolUse('4', 'Grep', { pattern: 'x', path: `${REPO}/api/a.ts` }),
  ];
  expect(unopened(events)).toEqual(['api/a.ts']);
});

test('a diff saved to a file counts once that file is read, and a failed one never', () => {
  const saved = '<persisted-output>\nOutput too large. Full output saved to: /home/node/out.txt\n';
  const preview = [...bash('1', 'git diff origin/main...HEAD -- api', saved)];
  expect(unopened(preview)).toEqual(['api/a.ts', 'web/c.tsx', 'api/b.ts', 'docs/d.md']);
  const read = [...preview, toolUse('2', 'Read', { file_path: '/home/node/out.txt' })];
  expect(unopened(read)).toEqual(['web/c.tsx', 'docs/d.md']);
  const failed = [toolUse('3', 'Bash', { command: 'git diff -- web' }), result('3', 'error', true)];
  expect(unopened(failed)).toEqual(['api/a.ts', 'web/c.tsx', 'api/b.ts', 'docs/d.md']);
});

test('a result given as text parts is read the same', () => {
  const parts = [{ type: 'text', text: 'Full output saved to: /tmp/x.txt' }];
  const events = [
    toolUse('1', 'Bash', { command: 'git diff -- web' }),
    result('1', parts),
    toolUse('2', 'Read', { file_path: '/tmp/x.txt' }),
  ];
  expect(unopened(events)).toEqual(['api/a.ts', 'api/b.ts', 'docs/d.md']);
});

test('commands that show none of the change', () => {
  expect(commandShown('git log origin/main..HEAD', REPO)).toBeNull();
  expect(commandShown('grep -rn foo api', REPO)).toBeNull();
  expect(commandShown('git diff --stat=200 -- api', REPO)).toBeNull();
  expect(commandShown('git diff HEAD -- ./api/', REPO)).toEqual(['api']);
});
