// Tests cutting a large change into slices: from a grouping by spec, or by folder.

import { expect, test } from 'bun:test';

import { hunkKey, type Hunk } from '../diff/diff-hunks';
import type { GroupingResult } from '../schema/schema-review-groupings';
import {
  MAX_SLICES,
  slicesByFolder,
  slicesFromGrouping,
  type SliceSource,
} from './agent-review-slices';

function hunk(start: number, lines: number): Hunk {
  return {
    key: hunkKey(start, start),
    oldStart: start,
    oldLines: 0,
    newStart: start,
    newLines: lines,
    header: `@@ -${start} +${start},${lines} @@`,
    additions: lines,
    deletions: 0,
  };
}

function source(path: string, ...hunks: Hunk[]): SliceSource {
  return { path, hunks };
}

const group = (
  title: string,
  files: string[],
  hunks?: Record<string, string[]>,
): GroupingResult['groups'][number] => ({
  key: title,
  title,
  spec: `spec of ${title}`,
  summary: `summary of ${title}`,
  files,
  ...(hunks ? { hunks } : {}),
});

test('each hunk goes to the first group that names it; what none takes is unrelated', () => {
  const sources = [
    source('api/a.ts', hunk(1, 100), hunk(200, 80)),
    source('web/b.tsx', hunk(1, 120)),
    source('package.json', hunk(3, 60)),
  ];
  const result: GroupingResult = {
    groups: [
      group('Publish', ['web/b.tsx'], { 'api/a.ts': [hunkKey(1, 1)] }),
      group('Show', ['api/a.ts', 'web/b.tsx']),
    ],
    unrelated: [],
    missing: [],
  };
  const slices = slicesFromGrouping(result, sources);
  expect(slices.map((slice) => [slice.title, slice.lines, slice.files])).toEqual([
    [
      'Publish',
      220,
      [
        { path: 'web/b.tsx', hunks: null, lines: 120 },
        { path: 'api/a.ts', hunks: [hunkKey(1, 1)], lines: 100 },
      ],
    ],
    ['Show', 80, [{ path: 'api/a.ts', hunks: [hunkKey(200, 200)], lines: 80 }]],
    [
      'Changes no part of the spec asked for',
      60,
      [{ path: 'package.json', hunks: null, lines: 60 }],
    ],
  ]);
  expect(slices[0]?.spec).toBe('spec of Publish');
});

test('a slice too small is merged into the one before it', () => {
  const sources = [source('a.ts', hunk(1, 300)), source('b.ts', hunk(1, 10))];
  const result: GroupingResult = {
    groups: [group('Big', ['a.ts']), group('Tiny', ['b.ts'])],
    unrelated: [],
    missing: [],
  };
  const slices = slicesFromGrouping(result, sources);
  expect(slices.map((slice) => [slice.title, slice.lines])).toEqual([['Big + Tiny', 310]]);
  expect(slices[0]?.spec).toBe('spec of Big\n\nspec of Tiny');
});

test('a group too large is split by folder', () => {
  const sources = [source('api/a.ts', hunk(1, 900)), source('web/b.tsx', hunk(1, 900))];
  const result: GroupingResult = {
    groups: [group('All', ['api/a.ts', 'web/b.tsx'])],
    unrelated: [],
    missing: [],
  };
  expect(slicesFromGrouping(result, sources).map((slice) => slice.title)).toEqual([
    'All (api/a.ts)',
    'All (web/b.tsx)',
  ]);
});

test('by folder: a large folder is cut deeper, small ones packed together and named', () => {
  const sources = [
    source('docs/x.md', hunk(1, 100)),
    source('api/src/a.ts', hunk(1, 700)),
    source('api/src/a.spec.ts', hunk(1, 200)),
    source('api/test/t.ts', hunk(1, 600)),
    source('web/b.tsx', hunk(1, 300)),
  ];
  expect(slicesByFolder(sources).map((slice) => [slice.title, slice.lines])).toEqual([
    ['api/src/', 900],
    ['api/test/t.ts, docs/x.md, web/b.tsx', 1000],
  ]);
});

test('by folder: never more than the cap', () => {
  const sources = Array.from({ length: 20 }, (_, index) =>
    source(`f${String(index).padStart(2, '0')}/x.ts`, hunk(1, 1000)),
  );
  const slices = slicesByFolder(sources);
  expect(slices.length).toBeLessThanOrEqual(MAX_SLICES);
  expect(slices.reduce((total, slice) => total + slice.lines, 0)).toBe(20_000);
});
