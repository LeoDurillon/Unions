import { expect, test } from 'bun:test';

import { gitBlobId, safeFileName, uniqueFileName } from './attachments';

test('file names keep their extension but lose folders and odd characters', () => {
  expect(safeFileName('report.csv')).toBe('report.csv');
  expect(safeFileName('../../etc/passwd')).toBe('passwd');
  expect(safeFileName(String.raw`C:\Users\me\bad file;rm -rf.txt`)).toBe('bad file_rm -rf.txt');
  expect(safeFileName('.env')).toBe('env');
  expect(safeFileName('..')).toBe('file');
  expect(safeFileName('')).toBe('file');
});

test('a taken name gets a number before its extension', () => {
  expect(uniqueFileName('a.csv', new Set())).toBe('a.csv');
  expect(uniqueFileName('a.csv', new Set(['a.csv', 'a (2).csv']))).toBe('a (3).csv');
  expect(uniqueFileName('README', new Set(['README']))).toBe('README (2)');
});

test('the blob id is the one git computes', async () => {
  const bytes = new TextEncoder().encode('hello\n');
  const git = Bun.spawn(['git', 'hash-object', '--stdin'], { stdin: bytes, stdout: 'pipe' });
  expect(gitBlobId(bytes)).toBe((await new Response(git.stdout).text()).trim());
});
