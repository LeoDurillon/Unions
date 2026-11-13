// Tests merging a sliced review's findings: owned lines first, duplicates once, the parts in the summary.

import { expect, test } from 'bun:test';

import { hunkKey, type ReviewSlice } from '@union/core';

import type { Findings } from './agent-review-findings';
import { isOwned, mergeSliced, type PartAnswer } from './agent-review-merge';

const PATCHES: Record<string, string> = {
  'a.ts': '@@ -1,2 +1,3 @@\n a\n+b\n c\n@@ -40,1 +41,2 @@\n x\n+y\n',
  'b.ts': '@@ -0,0 +1,2 @@\n+p\n+q\n',
};

function patchOf(path: string): string | undefined {
  return PATCHES[path];
}

const FIRST: ReviewSlice = {
  title: 'First',
  spec: '',
  summary: '',
  lines: 2,
  files: [{ path: 'a.ts', hunks: [hunkKey(1, 1)], lines: 1 }],
};
const SECOND: ReviewSlice = {
  title: 'Second',
  spec: '',
  summary: '',
  lines: 3,
  files: [
    { path: 'a.ts', hunks: [hunkKey(40, 41)], lines: 1 },
    { path: 'b.ts', hunks: null, lines: 2 },
  ],
};

function comment(path: string, line: number, body: string): Findings['comments'][number] {
  return { pr: null, path, side: 'new', startLine: line, endLine: line, body };
}

function part(title: string, comments: Findings['comments'], summary = ''): PartAnswer {
  return { title, findings: { summary, comments }, error: null };
}

test('a comment is owned by the slice whose hunk holds its lines', () => {
  expect(isOwned(comment('a.ts', 2, ''), FIRST, patchOf)).toBe(true);
  expect(isOwned(comment('a.ts', 42, ''), FIRST, patchOf)).toBe(false);
  expect(isOwned(comment('a.ts', 42, ''), SECOND, patchOf)).toBe(true);
  expect(isOwned(comment('b.ts', 9, ''), SECOND, patchOf)).toBe(true);
});

test("the owner's comment wins a duplicate; the seams' come last", () => {
  const merged = mergeSliced(
    [FIRST, SECOND],
    [
      part('First', [comment('a.ts', 42, 'seen from first'), comment('a.ts', 2, 'first')]),
      part('Second', [comment('a.ts', 42, 'owner')], 'fine'),
    ],
    part(
      'How the parts fit together',
      [comment('b.ts', 1, 'seam'), comment('a.ts', 2, 'again')],
      'Overall good.',
    ),
    patchOf,
  );
  expect(merged.comments.map((finding) => finding.body)).toEqual(['first', 'owner', 'seam']);
  expect(merged.summary).toBe(
    'Overall good.\n\nReviewed in 2 parts, then how they fit together:\n\n' +
      '- **First** (2 comments): nothing to add.\n' +
      '- **Second** (1 comments): fine\n' +
      '- **How the parts fit together** (2 comments): Overall good.',
  );
});

test('a failed part is named in the summary', () => {
  const failed: PartAnswer = { title: 'Second', findings: null, error: 'usage limit' };
  const merged = mergeSliced(
    [FIRST, SECOND],
    [part('First', []), failed],
    part('Seams', []),
    patchOf,
  );
  expect(merged.summary).toContain('- **Second**: not reviewed (usage limit).');
});
