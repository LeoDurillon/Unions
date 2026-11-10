import { describe, expect, test } from 'bun:test';

import { filterFiles, isFiltering } from './file-filter';

const files = [
  { path: 'src/review/file-list.tsx', oldPath: 'src/review/file-list.tsx', code: true },
  { path: 'src/review/file-list.test.ts', oldPath: 'src/review/file-list.test.ts', code: false },
  { path: 'docs/review.md', oldPath: 'docs/review.md', code: false },
  { path: 'src/board/card.tsx', oldPath: 'src/board/ticket-card.tsx', code: true },
];
const paths = (filter: { query: string; codeOnly: boolean }): string[] =>
  filterFiles(files, filter).map((file) => file.path);

describe('filterFiles', () => {
  test('an empty filter keeps every file, in order', () => {
    expect(paths({ query: '  ', codeOnly: false })).toEqual(files.map((file) => file.path));
  });

  test('the query keeps the paths holding each of its words, the list order kept', () => {
    expect(paths({ query: 'list review', codeOnly: false })).toEqual([
      'src/review/file-list.tsx',
      'src/review/file-list.test.ts',
    ]);
    expect(paths({ query: 'flist', codeOnly: false })).toEqual([]);
    expect(paths({ query: 'REVIEW', codeOnly: false })).toEqual([
      'src/review/file-list.tsx',
      'src/review/file-list.test.ts',
      'docs/review.md',
    ]);
  });

  test('a renamed file is found by its old name', () => {
    expect(paths({ query: 'ticket-card', codeOnly: false })).toEqual(['src/board/card.tsx']);
  });

  test('Code only keeps the code files, and combines with the query', () => {
    expect(paths({ query: '', codeOnly: true })).toEqual([
      'src/review/file-list.tsx',
      'src/board/card.tsx',
    ]);
    expect(paths({ query: 'review', codeOnly: true })).toEqual(['src/review/file-list.tsx']);
  });
});

describe('isFiltering', () => {
  test('only a query or Code only filters', () => {
    expect(isFiltering({ query: ' ', codeOnly: false })).toBe(false);
    expect(isFiltering({ query: 'a', codeOnly: false })).toBe(true);
    expect(isFiltering({ query: '', codeOnly: true })).toBe(true);
  });
});
