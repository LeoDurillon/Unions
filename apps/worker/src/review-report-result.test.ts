import { expect, test } from 'bun:test';

import type { ReportSpec } from '@union/core';

import { keepInCheckout } from './review-report-checkout';
import { parseReport } from './review-report-result';

const SPECS: ReportSpec[] = [
  { id: 1, kind: 'ticket', label: 'Ticket', text: 'Unpublish the other scenarios on activation.' },
  { id: 2, kind: 'notion', label: 'Notion: Tooltip', text: 'Show a tooltip   explaining why.' },
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

test('an answer without a block holding requirements is no report', () => {
  expect(parseReport('Nothing to say.', SPECS, FILES)).toBeNull();
  expect(parseReport(answer({ groups: [] }), SPECS, FILES)).toBeNull();
});

test('keeps a quote found in a spec sent, under the spec it is in; a made-up one is lost', () => {
  const result = parseReport(
    answer({
      requirements: [
        { title: 'Unpublish', spec: 'unpublish the OTHER scenarios', specId: 2, status: 'done' },
        { title: 'Tooltip', spec: 'Show a tooltip explaining why', specId: 2, status: 'missing' },
        { title: 'Logs', spec: 'Keep a log of every publication', specId: 1, status: 'weird' },
        { spec: 'no title' },
      ],
    }),
    SPECS,
    FILES,
  );
  expect(result?.requirements.map((r) => [r.key, r.spec, r.specId, r.status])).toEqual([
    ['unpublish', 'unpublish the OTHER scenarios', 1, 'done'],
    ['tooltip', 'Show a tooltip explaining why', 2, 'missing'],
    ['logs', null, 1, 'unclear'],
  ]);
  // The requirement without a title, and the lost quote.
  expect(result?.dropped).toBe(2);
  expect(result?.verdict).toBe('partial');
});

test('the changed files the report places nowhere are not looked at; unknown paths go', () => {
  const result = parseReport(
    answer({
      verdict: 'matches',
      requirements: [
        {
          title: 'Unpublish',
          status: 'done',
          evidence: [
            { path: 'api.ts', start: 72, end: 40 },
            { path: '../etc/passwd', start: 1 },
            { path: 'api.ts' },
          ],
          tests: ['api.test.ts', '/abs.ts'],
        },
      ],
      outOfScope: [
        { path: 'api.ts', lines: [41], reason: 'renames a helper', risk: 'low' },
        { path: 'not/in/diff.ts', reason: 'x', risk: 'high' },
      ],
    }),
    SPECS,
    FILES,
  );
  expect(result?.requirements[0]?.evidence).toEqual([{ path: 'api.ts', start: 40, end: 72 }]);
  expect(result?.requirements[0]?.tests).toEqual(['api.test.ts']);
  expect(result?.outOfScope[0]?.hunks).toHaveLength(1);
  expect(result?.outOfScope.map(({ path, reason, risk }) => ({ path, reason, risk }))).toEqual([
    { path: 'api.ts', reason: 'renames a helper', risk: 'low' },
  ]);
  expect(result?.unreviewed).toEqual(['ui.tsx', 'package.json']);
  // Two bad evidence entries, one bad test path, one path outside the diff.
  expect(result?.dropped).toBe(4);
  expect(result?.verdict).toBe('matches');
});

test('important files: in order, once each, at most 8, at most 2 outside the change', () => {
  const unchanged = ['a.ts', 'b.ts', 'c.ts'].map((path) => ({ path, why: 'caller' }));
  const many = Array.from({ length: 8 }, (_, at) => ({ path: `extra${at}.ts` }));
  const result = parseReport(
    answer({
      requirements: [{ key: 'unpub', title: 'Unpublish', status: 'done' }],
      importantFiles: [
        {
          path: 'api.ts',
          why: 'The heart of it.',
          kind: 'core',
          lines: [{ start: 10, end: 20 }, { start: 0 }],
          requirements: ['unpub', 'Unpublish', 'unknown'],
        },
        { path: 'api.ts', why: 'again' },
        { path: 'ui.tsx', kind: 'odd' },
        ...unchanged,
        ...many,
      ],
    }),
    SPECS,
    FILES,
  );
  const files = result?.importantFiles ?? [];
  expect(files.map((file) => [file.path, file.unchanged])).toEqual([
    ['api.ts', false],
    ['ui.tsx', false],
    ['a.ts', true],
    ['b.ts', true],
  ]);
  expect(result?.dropped).toBe(10);
  expect(files[0]).toEqual({
    path: 'api.ts',
    why: 'The heart of it.',
    kind: 'core',
    lines: [{ start: 10, end: 20 }],
    requirements: ['unpub'],
    unchanged: false,
  });
  expect(files[1]?.kind).toBe('core');
});

test('the checkout drops what is not there and cuts line ranges to the file', () => {
  const parsed = parseReport(
    answer({
      requirements: [
        {
          title: 'Unpublish',
          status: 'done',
          evidence: [
            { path: 'api.ts', start: 40, end: 500 },
            { path: 'api.ts', start: 300, end: 310 },
            { path: 'gone.ts', start: 1, end: 2 },
          ],
          tests: ['api.test.ts', 'missing.test.ts'],
        },
      ],
      importantFiles: [
        { path: 'old.ts', lines: [{ start: 1, end: 5 }] },
        { path: 'helper.ts', lines: [{ start: 1, end: 900 }] },
        { path: 'ghost.ts' },
      ],
      risks: [{ title: 'Locks', paths: ['db.sql', 'api.ts'] }],
      docs: [
        { path: 'docs/a.md', note: 'x' },
        { path: 'docs/none.md', note: 'y' },
      ],
    }),
    SPECS,
    [...FILES, { path: 'old.ts', patch: '@@ -1,2 +0,0 @@\n-a\n-b' }],
  );
  expect(parsed).not.toBeNull();
  if (!parsed) {
    return;
  }
  const counts = new Map([
    ['api.ts', 120],
    ['api.test.ts', 30],
    ['helper.ts', 40],
    ['docs/a.md', 10],
  ]);
  const result = keepInCheckout(parsed, counts, new Set([...FILES.map((f) => f.path), 'old.ts']));
  expect(result.requirements[0]?.evidence).toEqual([{ path: 'api.ts', start: 40, end: 120 }]);
  expect(result.requirements[0]?.tests).toEqual(['api.test.ts']);
  // A deleted file of the change stays, without lines; an unchanged one must exist.
  expect(result.importantFiles.map((file) => [file.path, file.lines])).toEqual([
    ['old.ts', []],
    ['helper.ts', [{ start: 1, end: 40 }]],
  ]);
  expect(result.risks[0]?.paths).toEqual(['api.ts']);
  expect(result.docs).toEqual([{ path: 'docs/a.md', note: 'x' }]);
  // Two evidence entries, a test, an important file and a doc.
  expect(result.dropped).toBe(parsed.dropped + 5);
});

test('a quote matches its spec despite markdown marks, escapes and quote signs', () => {
  const specs: ReportSpec[] = [
    {
      id: 1,
      kind: 'notion',
      label: 'Notion',
      text: 'Texte “**Table de palier : MPR**”, sinon \\{seuil\\}',
    },
  ];
  const result = parseReport(
    answer({
      requirements: [
        { title: 'Label', spec: 'Texte "Table de palier : MPR"', specId: 1, status: 'done' },
        { title: 'Fallback', spec: 'sinon {seuil}', specId: 1, status: 'done' },
      ],
    }),
    specs,
    FILES,
  );
  expect(result?.requirements.map((r) => r.specId)).toEqual([1, 1]);
  expect(result?.dropped).toBe(0);
});

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
      ],
      attention: [{ kind: 'unasked', title: "'Hors paliers' case", requirement: 'known' }],
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
});
