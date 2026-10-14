import { expect, test } from 'bun:test';

import { hunksOf } from '@union/core/diff-hunks';

import type { GroupingView } from '../../src/routes/review-groupings';
import { focusOf, headerKey, hunkTags, inHunks, partialCount, UNRELATED_PART } from './spec-hunks';

const PATCH = `@@ -10,3 +10,4 @@
 a
+b
 c
 d
@@ -40,3 +41,4 @@
 a
+b
 c
 d`;

const result: NonNullable<GroupingView['result']> = {
  groups: [
    {
      key: 'publish',
      title: 'Publish',
      spec: '',
      summary: '',
      files: ['api.ts', 'ui.tsx'],
      hunks: { 'api.ts': ['-10+10'] },
    },
    { key: 'all', title: 'Everything', spec: '', summary: '', files: ['api.ts'] },
  ],
  unrelated: [{ path: 'api.ts', reason: 'helper', hunks: ['-40+41'] }],
  missing: [],
};

test('a part shows the hunks it took of a file, or the whole file', () => {
  expect(focusOf(result, 'publish', 'api.ts')).toEqual({ title: 'Publish', keys: ['-10+10'] });
  expect(focusOf(result, 'publish', 'ui.tsx')).toEqual({ title: 'Publish', keys: null });
  expect(focusOf(result, 'all', 'ui.tsx')).toBeNull();
  expect(focusOf(result, UNRELATED_PART, 'api.ts')).toEqual({
    title: 'Not in the spec',
    keys: ['-40+41'],
  });
  expect(partialCount(result, 'publish', 'api.ts')).toBe(1);
  expect(partialCount(result, 'publish', 'ui.tsx')).toBeNull();
});

test('each hunk is tagged with the parts it serves', () => {
  const tags = hunkTags(result, 'api.ts', hunksOf(PATCH));
  expect(tags.get('-10+10')).toEqual(['Publish', 'Everything']);
  expect(tags.get('-40+41')).toEqual(['Everything', 'Not in the spec']);
});

test('a comment is in a hunk when its last line is, on its side', () => {
  const [first] = hunksOf(PATCH);
  const shown = first ? [first] : [];
  expect(inHunks(shown, { side: 'new', endLine: 13 })).toBe(true);
  expect(inHunks(shown, { side: 'new', endLine: 42 })).toBe(false);
  expect(inHunks(shown, { side: 'old', endLine: 12 })).toBe(true);
  expect(headerKey('@@ -40,3 +41,4 @@ function x() {')).toBe('-40+41');
});
