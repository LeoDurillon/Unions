// Tests where a relative link in a repository file points.
import { expect, test } from 'bun:test';

import { resolveRepoPath } from './repo-paths';

test('a link is read from the file’s own folder', () => {
  expect(resolveRepoPath('docs/README.md', 'guide.md')).toBe('docs/guide.md');
  expect(resolveRepoPath('docs/README.md', './img/a.png')).toBe('docs/img/a.png');
  expect(resolveRepoPath('docs/api/README.md', '../setup.md#install')).toBe('docs/setup.md');
  expect(resolveRepoPath('README.md', 'packages/core/')).toBe('packages/core');
});

test('a leading slash starts from the root', () => {
  expect(resolveRepoPath('docs/a/README.md', '/LICENSE')).toBe('LICENSE');
  expect(resolveRepoPath('docs/README.md', '/')).toBe('');
});

test('escaped characters are read back', () => {
  expect(resolveRepoPath('README.md', 'docs/My%20File.md')).toBe('docs/My File.md');
  expect(resolveRepoPath('README.md', 'docs/100%.md')).toBe('docs/100%.md');
});

test('URLs, anchors and links above the root are left alone', () => {
  expect(resolveRepoPath('README.md', 'https://example.com/a.md')).toBeNull();
  expect(resolveRepoPath('README.md', 'mailto:a@b.c')).toBeNull();
  expect(resolveRepoPath('README.md', '//cdn.example.com/a.png')).toBeNull();
  expect(resolveRepoPath('README.md', '#usage')).toBeNull();
  expect(resolveRepoPath('README.md', '../outside.md')).toBeNull();
});
