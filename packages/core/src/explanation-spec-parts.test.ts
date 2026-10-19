// Tests the parts of a grouping by spec that selected lines touch.
import { expect, test } from 'bun:test';

import { explanationSpecParts } from './explanation-spec-parts';
import type { GroupingResult, SpecGroup } from './schema-review-groupings';

const PATCH = [
  '@@ -1,2 +1,3 @@',
  ' a',
  '+b',
  ' c',
  '@@ -20,2 +21,2 @@',
  '-old',
  '+new',
  ' tail',
].join('\n');

function group(key: string, extra: Partial<SpecGroup> = {}): SpecGroup {
  return { key, title: key, spec: `${key} spec`, summary: '', files: ['src/a.ts'], ...extra };
}

function grouping(groups: SpecGroup[]): GroupingResult {
  return { groups, unrelated: [], missing: [] };
}

test('a part holding the whole file is touched by any lines of it', () => {
  const parts = explanationSpecParts(
    grouping([group('export')]),
    { path: 'src/a.ts', patch: PATCH },
    { side: 'new', start: 2, end: 2 },
  );
  expect(parts).toEqual([{ key: 'export', title: 'export', spec: 'export spec' }]);
});

test('a part listing hunks is touched only by lines in one of them', () => {
  const result = grouping([
    group('first', { hunks: { 'src/a.ts': ['-1+1'] } }),
    group('second', { hunks: { 'src/a.ts': ['-20+21'] } }),
  ]);
  const file = { path: 'src/a.ts', patch: PATCH };
  expect(
    explanationSpecParts(result, file, { side: 'new', start: 21, end: 22 }).map((p) => p.key),
  ).toEqual(['second']);
  expect(
    explanationSpecParts(result, file, { side: 'old', start: 20, end: 20 }).map((p) => p.key),
  ).toEqual(['second']);
  expect(
    explanationSpecParts(result, file, { side: 'new', start: 1, end: 30 }).map((p) => p.key),
  ).toEqual(['first', 'second']);
});

test('a part without the file is not touched', () => {
  const parts = explanationSpecParts(
    grouping([group('other', { files: ['src/b.ts'] })]),
    { path: 'src/a.ts', patch: PATCH },
    { side: 'new', start: 2, end: 2 },
  );
  expect(parts).toEqual([]);
});
