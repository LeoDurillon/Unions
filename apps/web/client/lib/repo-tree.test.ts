// Tests the repository's folder index and the path filter.
import { describe, expect, test } from 'bun:test';

import type { RepositoryEntry } from '../../src/repository-api-types';
import { filterPaths, pathScore } from './path-filter';
import { foldersTo, indexEntries, nameOf, parentOf } from './repo-tree';

const file = (path: string): RepositoryEntry => ({ path, type: 'file', size: 1, sha: path });
const dir = (path: string): RepositoryEntry => ({ path, type: 'dir', size: null, sha: path });

describe('indexEntries', () => {
  test('folders come first, then files, each by name', () => {
    const index = indexEntries([file('b.ts'), dir('src'), file('a.ts'), dir('docs')]);
    expect(index.get('')?.map((entry) => entry.path)).toEqual(['docs', 'src', 'a.ts', 'b.ts']);
  });

  test('entries go under their folder', () => {
    const index = indexEntries([
      dir('src'),
      file('src/x.ts'),
      dir('src/lib'),
      file('src/lib/y.ts'),
    ]);
    expect(index.get('src')?.map((entry) => entry.path)).toEqual(['src/lib', 'src/x.ts']);
    expect(index.get('src/lib')?.map((entry) => entry.path)).toEqual(['src/lib/y.ts']);
  });

  test('a folder read later is added without doubling what is there', () => {
    const index = indexEntries([dir('src'), file('README.md')]);
    indexEntries([file('src/a.ts'), file('src/a.ts')], index);
    expect(index.get('src')?.map((entry) => entry.path)).toEqual(['src/a.ts']);
    expect(index.get('')).toHaveLength(2);
  });
});

test('paths split into folder and name', () => {
  expect(parentOf('a/b/c.ts')).toBe('a/b');
  expect(parentOf('c.ts')).toBe('');
  expect(nameOf('a/b/c.ts')).toBe('c.ts');
  expect(foldersTo('a/b/c.ts')).toEqual(['a', 'a/b']);
  expect(foldersTo('c.ts')).toEqual([]);
});

describe('filterPaths', () => {
  const paths = [
    'apps/web/client/components/board.tsx',
    'apps/web/src/routes/board-filter.ts',
    'packages/core/src/states.ts',
    'README.md',
  ];

  test('the letters in order, case ignored', () => {
    expect(pathScore('packages/core/src/states.ts', 'STATES')).not.toBeNull();
    expect(pathScore('packages/core/src/states.ts', 'zz')).toBeNull();
  });

  test('a match in the file name ranks above one spread over folders', () => {
    expect(filterPaths(paths, 'board')[0]).toBe('apps/web/client/components/board.tsx');
    expect(filterPaths(paths, 'readme')).toEqual(['README.md']);
  });

  test('an empty query finds nothing', () => {
    expect(filterPaths(paths, '  ')).toEqual([]);
  });
});
