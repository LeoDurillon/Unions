// Tests grouping explanations into threads and finding the code an answer cites.
import { expect, test } from 'bun:test';

import type { ExplanationView } from '../../../src/routes/review-explanations';
import { threadsOf } from './explain-panel';
import { citationsOf } from './explanation-answer';

function row(id: number, parentId: number | null): ExplanationView {
  return {
    id,
    parentId,
    path: 'a.ts',
    side: 'new',
    startLine: 1,
    endLine: 1,
    excerpt: '',
    question: null,
    headSha: 'h',
    status: 'succeeded',
    result: null,
    error: null,
    createdAt: id,
    startedAt: null,
    finishedAt: null,
    specs: [],
    outdated: false,
    specParts: [],
    partsOutdated: false,
  };
}

test('follow-ups join their first explanation; the newest thread comes first', () => {
  const threads = threadsOf([row(4, 2), row(3, null), row(2, 1), row(1, null)]);
  expect(threads.map((thread) => thread.map((turn) => turn.id))).toEqual([[3], [1, 2, 4]]);
});

test('citations name files of the change once each, with their line', () => {
  const text =
    'Calls `src/export/csv.ts:40`, then src/export/csv.ts:40 and `lib/x.ts:3`; see README.md:2.';
  expect(citationsOf(text, new Set(['src/export/csv.ts', 'README.md']))).toEqual([
    { path: 'src/export/csv.ts', line: 40 },
    { path: 'README.md', line: 2 },
  ]);
});
