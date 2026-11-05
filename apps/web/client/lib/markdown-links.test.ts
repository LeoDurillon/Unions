// Tests where a Markdown file's links and images go.
import { expect, test } from 'bun:test';

import type { RepositoryEntry } from '../../src/repository-api-types';
import { markdownUrl, tabHref, tabPathOf, type MarkdownBase } from './markdown-links';

const entry = (path: string, type: RepositoryEntry['type'] = 'file'): RepositoryEntry => ({
  path,
  type,
  size: 10,
  sha: `sha-${path}`,
});

const base: MarkdownBase = {
  projectId: 3,
  place: { owner: 'acme', repo: 'shop', sha: 'abc' },
  ref: null,
  byPath: new Map(
    [entry('docs/guide.md'), entry('docs'), entry('docs/img/logo.png')].map((e) => [e.path, e]),
  ),
};

test('a link to a file of the commit opens it in the tab', () => {
  expect(markdownUrl(base, 'README.md', 'docs/guide.md', 'href')).toBe(
    '?view=repository&repo-path=docs%2Fguide.md',
  );
  expect(markdownUrl({ ...base, ref: 'dev' }, 'docs/x.md', '..', 'href')).toBe(
    '?view=repository&repo-ref=dev',
  );
});

test('a link to a path the commit lacks goes to GitHub', () => {
  expect(markdownUrl(base, 'README.md', 'LICENSE', 'href')).toBe(
    'https://github.com/acme/shop/blob/abc/LICENSE',
  );
});

test('an image of the commit loads from the repository', () => {
  expect(markdownUrl(base, 'docs/guide.md', 'img/logo.png', 'src')).toBe(
    '/api/projects/3/repository/raw?sha=sha-docs%2Fimg%2Flogo.png&path=docs%2Fimg%2Flogo.png&size=10',
  );
  expect(markdownUrl(base, 'README.md', 'missing.png', 'src')).toBe('');
});

test('URLs and anchors are left to the default', () => {
  expect(markdownUrl(base, 'README.md', 'https://x.dev/a.png', 'src')).toBeUndefined();
  expect(markdownUrl(base, 'README.md', '#usage', 'href')).toBeUndefined();
});

test('the tab reads back the path of its own links only', () => {
  expect(tabPathOf(tabHref('dev', 'docs/guide.md'))).toBe('docs/guide.md');
  expect(tabPathOf(tabHref(null, ''))).toBe('');
  expect(tabPathOf('?ticket=4')).toBeNull();
  expect(tabPathOf('https://x.dev')).toBeNull();
});
