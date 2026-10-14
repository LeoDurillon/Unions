import { expect, test } from 'bun:test';

import { hunkAt, hunkKey, hunksOf, keepHunks } from './diff-hunks';

const PATCH = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -10,3 +10,4 @@ function one() {
 keep
+added
 keep
 keep
@@ -40,4 +41,3 @@ function two() {
 keep
-gone
 keep
 keep
@@ -80 +80,0 @@
-last`;

test('a patch splits into hunks named by their start lines, with their counts', () => {
  expect(
    hunksOf(PATCH).map(({ key, newStart, newLines, additions, deletions }) => [
      key,
      newStart,
      newLines,
      additions,
      deletions,
    ]),
  ).toEqual([
    ['-10+10', 10, 4, 1, 0],
    ['-40+41', 41, 3, 0, 1],
    ['-80+80', 80, 0, 0, 1],
  ]);
  // GitHub's patches start at the first hunk, without file headers.
  expect(hunksOf('@@ -1 +1 @@\n-a\n+b').map((hunk) => hunk.key)).toEqual([hunkKey(1, 1)]);
});

test('keeping some hunks keeps the file headers and those hunks only', () => {
  const kept = keepHunks(PATCH, new Set(['-40+41']));
  expect(
    kept.startsWith('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -40,4 +41,3 @@'),
  ).toBe(true);
  expect(kept).not.toContain('+added');
  expect(kept).not.toContain('-last');
});

test('a cited line names the hunk it falls in, or a near one, never a far one', () => {
  const hunks = hunksOf(PATCH);
  expect(hunkAt(hunks, 12)?.key).toBe('-10+10');
  expect(hunkAt(hunks, 41)?.key).toBe('-40+41');
  // A few lines off: the other diff had more context.
  expect(hunkAt(hunks, 45)?.key).toBe('-40+41');
  // A deletion-only hunk sits at its start line.
  expect(hunkAt(hunks, 80)?.key).toBe('-80+80');
  expect(hunkAt(hunks, 60)).toBeNull();
});
