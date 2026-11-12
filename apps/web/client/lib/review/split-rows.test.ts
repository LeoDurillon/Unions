import { expect, test } from 'bun:test';

import { parsePatch } from '@union/core/diff';

import { splitRows } from './split-rows';

const PATCH = `@@ -1,5 +1,5 @@
 keep
-old one
-old two
-old three
+new one
+new two
 middle
+only added
\\ No newline at end of file`;

test('removed runs face the added lines that follow; context faces itself', () => {
  const rows = splitRows(parsePatch(PATCH)).map((row) =>
    row.kind === 'full' ? row.line.kind : [row.left?.text ?? null, row.right?.text ?? null],
  );
  expect(rows).toEqual([
    'hunk',
    ['keep', 'keep'],
    ['old one', 'new one'],
    ['old two', 'new two'],
    ['old three', null],
    ['middle', 'middle'],
    [null, 'only added'],
    'meta',
  ]);
});

test('an added run followed by a removed run is not paired backwards', () => {
  const rows = splitRows(parsePatch('@@ -1,1 +1,1 @@\n+added\n-removed'));
  expect(rows.slice(1)).toMatchObject([
    { left: null, right: { text: 'added' } },
    { left: { text: 'removed' }, right: null },
  ]);
});
