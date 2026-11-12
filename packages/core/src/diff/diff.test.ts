import { expect, test } from 'bun:test';

import { isIgnoredPath, parseDiff, parsePatch } from './diff';

const DIFF = `diff --git a/math.js b/math.js
index 1111111..2222222 100644
--- a/math.js
+++ b/math.js
@@ -1,3 +1,7 @@
 export function add(a, b) {
   return a + b;
 }
+
+export function subtract(a, b) {
+  return a - b;
+}
diff --git a/notes.md b/notes.md
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/notes.md
@@ -0,0 +1 @@
+hello
\\ No newline at end of file
diff --git a/old.txt b/old.txt
deleted file mode 100644
index 4444444..0000000
--- a/old.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-one
-two
diff --git a/src/a.ts b/src/b.ts
similarity index 90%
rename from src/a.ts
rename to src/b.ts
index 5555555..6666666 100644
--- a/src/a.ts
+++ b/src/b.ts
@@ -2,2 +2,2 @@ export const x = 1;
-const y = 2;
+const y = 3;
 const z = 4;
diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..7777777
Binary files /dev/null and b/logo.png differ
`;

test('a branch diff is split into files with status and counts', () => {
  const files = parseDiff(DIFF);
  expect(
    files.map((file) => [
      file.path,
      file.oldPath,
      file.status,
      file.additions,
      file.deletions,
      file.binary,
    ]),
  ).toEqual([
    ['math.js', 'math.js', 'modified', 4, 0, false],
    ['notes.md', 'notes.md', 'added', 1, 0, false],
    ['old.txt', 'old.txt', 'deleted', 0, 2, false],
    ['src/b.ts', 'src/a.ts', 'renamed', 1, 1, false],
    ['logo.png', 'logo.png', 'added', 0, 0, true],
  ]);
  expect(files[0]?.patch.startsWith('diff --git a/math.js b/math.js')).toBe(true);
  expect(files[0]?.patch).not.toContain('notes.md');
});

test('a patch becomes numbered lines on both sides', () => {
  const rename = parseDiff(DIFF)[3]?.patch ?? '';
  expect(parsePatch(rename)).toEqual([
    { kind: 'hunk', text: '@@ -2,2 +2,2 @@ export const x = 1;' },
    { kind: 'del', oldLine: 2, text: 'const y = 2;' },
    { kind: 'add', newLine: 2, text: 'const y = 3;' },
    { kind: 'context', oldLine: 3, newLine: 3, text: 'const z = 4;' },
  ]);
  const added = parsePatch(parseDiff(DIFF)[1]?.patch ?? '');
  expect(added.at(-1)).toEqual({ kind: 'meta', text: '\\ No newline at end of file' });
});

test('quoted paths with escaped utf-8 are decoded; an empty diff has no files', () => {
  const quoted = `diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"
--- "a/caf\\303\\251.txt"
+++ "b/caf\\303\\251.txt"
@@ -1 +1 @@
-a
+b
`;
  expect(parseDiff(quoted)[0]?.path).toBe('café.txt');
  expect(parseDiff('')).toEqual([]);
});

test('lock files are hidden at any depth unless turned off', () => {
  expect(isIgnoredPath('bun.lock', [], true)).toBe(true);
  expect(isIgnoredPath('apps/web/package-lock.json', [], true)).toBe(true);
  expect(isIgnoredPath('bun.lock', [], false)).toBe(false);
  expect(isIgnoredPath('src/lockfile.ts', [], true)).toBe(false);
});

test('project patterns follow gitignore rules', () => {
  const patterns = ['dist/', '*.snap', '/generated/**', 'docs/*.md', '# a comment', ''];
  expect(isIgnoredPath('dist/app.js', patterns, false)).toBe(true);
  expect(isIgnoredPath('packages/ui/dist/a.js', patterns, false)).toBe(true);
  expect(isIgnoredPath('src/dist.ts', patterns, false)).toBe(false);
  expect(isIgnoredPath('src/__snapshots__/a.test.ts.snap', patterns, false)).toBe(true);
  expect(isIgnoredPath('generated/api/types.ts', patterns, false)).toBe(true);
  expect(isIgnoredPath('src/generated/types.ts', patterns, false)).toBe(false);
  expect(isIgnoredPath('docs/intro.md', patterns, false)).toBe(true);
  expect(isIgnoredPath('docs/guide/intro.md', patterns, false)).toBe(false);
  expect(isIgnoredPath('a+b(1).txt', ['a+b(1).txt'], false)).toBe(true);
});
