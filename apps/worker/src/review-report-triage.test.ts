import { expect, test } from 'bun:test';

import type { ReportSpec } from '@union/core';

import { parseReport } from './review-report-result';

const SPECS: ReportSpec[] = [
  { id: 1, kind: 'ticket', label: 'Ticket', text: 'Unpublish the other scenarios on activation.' },
];

/** `api.ts` has two hunks, starting on new lines 10 and 41. */
const API = `@@ -10,3 +10,4 @@ function publish() {
 a
+b
 c
 d
@@ -40,3 +41,4 @@ function unpublish() {
 a
+b
 c
 d`;
const FILES = [
  { path: 'api.ts', patch: API },
  { path: 'ui.tsx', patch: '@@ -1 +1 @@\n-a\n+b' },
  { path: 'package.json', patch: '@@ -1 +1 @@\n-a\n+b' },
];

function answer(block: unknown): string {
  return `Report.\n\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\``;
}

test('never "matches" while a requirement is not done', () => {
  const result = parseReport(
    answer({
      verdict: 'matches',
      requirements: [
        { title: 'Label', status: 'done' },
        { title: 'Household income', status: 'unclear' },
      ],
    }),
    SPECS,
    FILES,
  );
  expect(result?.verdict).toBe('partial');
});

test('what needs the reviewer: at most 5 of the agent, then every gap it left out', () => {
  const result = parseReport(
    answer({
      requirements: [
        {
          key: 'label',
          title: 'Label',
          status: 'differs',
          note: 'Plural.',
          evidence: [{ path: 'ui.tsx', start: 1 }],
        },
        { key: 'tooltip', title: 'Tooltip', status: 'missing', note: 'Not found.' },
        { key: 'unpub', title: 'Unpublish', status: 'done' },
      ],
      attention: [
        {
          kind: 'differs',
          title: 'Plural label',
          requirement: 'Label',
          lines: [{ path: 'ui.tsx', start: 1, end: 1 }],
        },
        { kind: 'odd', title: 'Shared helper', lines: [{ path: '/etc/x', start: 1 }] },
        { detail: 'no title' },
        ...Array.from({ length: 5 }, (_, at) => ({ kind: 'question', title: `Q${at}` })),
      ],
    }),
    SPECS,
    FILES,
  );
  expect(result?.attention.map((item) => [item.kind, item.title, item.requirement])).toEqual([
    ['differs', 'Plural label', 'label'],
    ['risk', 'Shared helper', null],
    ['question', 'Q0', null],
    ['question', 'Q1', null],
    ['question', 'Q2', null],
    ['missing', 'Tooltip', 'tooltip'],
  ]);
  expect(result?.attention[0]?.cites).toEqual([{ path: 'ui.tsx', start: 1, end: 1 }]);
  // A bad line, an item without a title, two past the fifth.
  expect(result?.dropped).toBe(4);
});

test('skim: changed files only, once, never one to read first or to look at', () => {
  const result = parseReport(
    answer({
      requirements: [{ title: 'Unpublish', status: 'done' }],
      importantFiles: [{ path: 'api.ts' }],
      attention: [{ title: 'Bump', lines: [{ path: 'package.json', start: 1 }] }],
      skim: [
        { path: 'ui.tsx', why: 'wiring' },
        { path: 'ui.tsx', why: 'again' },
        { path: 'api.ts', why: 'read first' },
        { path: 'package.json', why: 'looked at' },
        { path: 'elsewhere.ts', why: 'not changed' },
      ],
    }),
    SPECS,
    FILES,
  );
  expect(result?.skim).toEqual([{ path: 'ui.tsx', why: 'wiring' }]);
  expect(result?.unreviewed).toEqual([]);
  expect(result?.dropped).toBe(4);
});

test("a requirement's unasked behaviour needs the reviewer, done or not, unless the agent raised it", () => {
  const result = parseReport(
    answer({
      requirements: [
        {
          key: 'shown',
          title: 'Threshold shown',
          status: 'done',
          unasked: 'Also shown on loan campaigns.',
          evidence: [{ path: 'ui.tsx', start: 1 }],
        },
        { key: 'known', title: 'Known threshold', status: 'done', unasked: "Adds 'Hors paliers'." },
        { key: 'plain', title: 'Plain', status: 'done', unasked: '' },
        {
          key: 'overview',
          title: 'Overview line',
          status: 'done',
          unasked: 'Hidden on loan campaigns.',
          evidence: [{ path: 'api.ts', start: 10 }],
        },
      ],
      attention: [
        {
          kind: 'unasked',
          title: "'Hors paliers' case",
          requirement: 'known',
          lines: [{ path: 'api.ts', start: 41 }],
        },
      ],
    }),
    SPECS,
    FILES,
  );
  expect(
    result?.attention.map((item) => [item.kind, item.title, item.detail, item.requirement]),
  ).toEqual([
    ['unasked', "'Hors paliers' case", '', 'known'],
    ['unasked', 'Also shown on loan campaigns.', 'Threshold shown', 'shown'],
  ]);
  expect(result?.attention[1]?.cites).toEqual([{ path: 'ui.tsx', start: 1, end: 1 }]);
  // The overview's is left out: the agent's item already cites its file.
  expect(result?.attention).toHaveLength(2);
});
