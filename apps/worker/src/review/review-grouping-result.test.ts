import { expect, test } from 'bun:test';

import { hunkIndex } from './review-grouping-format';
import { parseGrouping } from './review-grouping-result';

/** `api.ts` has three hunks, starting on new lines 10, 41 and 90; `logo.png` has none. */
const API = `@@ -10,3 +10,4 @@ function publish() {
 a
+b
 c
 d
@@ -40,3 +41,4 @@ function unpublish() {
 a
+b
 c
 d
@@ -88,3 +90,4 @@ function rename() {
 a
+b
 c
 d`;
const FILES = [
  { path: 'api.ts', patch: API },
  { path: 'ui.tsx', patch: '@@ -1 +1 @@\n-a\n+b' },
  { path: 'logo.png', patch: '' },
];

function answer(block: unknown): string {
  return `\`\`\`json\n${JSON.stringify(block)}\n\`\`\``;
}

test('a file split between parts keeps, in each group, only the hunks that serve it', () => {
  const result = parseGrouping(
    answer({
      groups: [
        { title: 'Publish', files: ['ui.tsx'], hunks: [{ path: 'api.ts', lines: [11] }] },
        // 43: inside the second hunk; 88: a few lines before the third (more context in the agent's diff).
        { title: 'Unpublish', hunks: [{ path: 'api.ts', lines: [43, 88] }] },
        { title: 'Everything', files: ['api.ts', 'logo.png'] },
      ],
    }),
    FILES,
  );
  expect(result?.groups.map(({ title, files, hunks }) => ({ title, files, hunks }))).toEqual([
    { title: 'Publish', files: ['api.ts', 'ui.tsx'], hunks: { 'api.ts': ['-10+10'] } },
    { title: 'Unpublish', files: ['api.ts'], hunks: { 'api.ts': ['-40+41', '-88+90'] } },
    // Every hunk of a file: the file is whole, no hunk list.
    { title: 'Everything', files: ['api.ts', 'logo.png'], hunks: undefined },
  ]);
  expect(result?.unrelated).toEqual([]);
});

test('hunks no group takes are unrelated: with the agent reason, else as not placed', () => {
  const result = parseGrouping(
    answer({
      groups: [{ title: 'Publish', hunks: [{ path: 'api.ts', lines: [10] }] }],
      unrelated: [
        { path: 'api.ts', lines: [90], reason: 'renames a helper' },
        // Already in a group: not unrelated.
        { path: 'api.ts', lines: [10], reason: 'wrong' },
        { path: 'logo.png', reason: 'new logo' },
      ],
    }),
    FILES,
  );
  expect(result?.unrelated).toEqual([
    { path: 'api.ts', reason: 'renames a helper', hunks: ['-88+90'] },
    { path: 'logo.png', reason: 'new logo' },
    { path: 'api.ts', reason: 'Not placed by the agent', hunks: ['-40+41'] },
    { path: 'ui.tsx', reason: 'Not placed by the agent' },
  ]);
});

test('a line far from every hunk places nothing; a group left empty is missing', () => {
  const result = parseGrouping(
    answer({
      groups: [{ title: 'Logs', spec: 'Keep a log', hunks: [{ path: 'api.ts', lines: [300] }] }],
    }),
    FILES,
  );
  expect(result?.groups).toEqual([]);
  expect(result?.missing).toEqual([{ spec: 'Keep a log', note: 'No change placed under it' }]);
});

test('the hunk index names every hunk by its new start line, and files without hunks', () => {
  const index = hunkIndex(FILES);
  expect(index).toContain('## api.ts');
  expect(index).toContain('- line 41: `@@ -40,3 +41,4 @@ function unpublish() {` (+1 −0)');
  expect(index).toContain('## logo.png\n\n- no hunks');
});
