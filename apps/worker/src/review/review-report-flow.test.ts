import { expect, test } from 'bun:test';

import type { ReportSpec } from '@union/core';

import { keepInCheckout } from './review-report-checkout';
import { parseReport } from './review-report-result';

const SPECS: ReportSpec[] = [
  {
    id: 1,
    kind: 'ticket',
    label: 'Ticket',
    text: 'Afficher la table de **palier** en lecture seule.',
  },
];
const FILES = [
  {
    path: 'page.tsx',
    patch: '@@ -1,2 +1,3 @@\n a\n+// Load the project: the table name lives there\n b',
  },
  { path: 'header.tsx', patch: '@@ -1 +1 @@\n-a\n+b' },
];
const COMMITS = 'Show the threshold table\n\nThe name comes from the project, not the campaign.\n';

function step(source: string, quote: string): Record<string, unknown> {
  return { title: source, what: 'w', why: 'y', source, quote, nodes: ['page', 'ghost'] };
}

function answer(flow: unknown): string {
  return `\`\`\`json\n${JSON.stringify({ requirements: [], flow })}\n\`\`\``;
}

test('nodes on known ids and paths, edges between them; a missing flow is empty', () => {
  expect(parseReport(answer(null), SPECS, FILES)?.flow).toEqual({
    nodes: [],
    edges: [],
    steps: [],
  });
  const flow = parseReport(
    answer({
      nodes: [
        { id: 'page', label: 'Campaign page', path: 'page.tsx', lines: { start: 9, end: 3 } },
        { id: 'header', path: 'header.tsx' },
        { id: 'helper', label: 'Shared helper', path: 'lib/threshold.ts' },
        { id: 'page', path: 'again.tsx' },
        { id: 'bad', path: '../x.ts' },
        { path: 'no-id.ts' },
      ],
      edges: [
        { from: 'page', to: 'header', label: 'passes the name' },
        { from: 'page', to: 'header', label: 'twice' },
        { from: 'header', to: 'header', label: 'itself' },
        { from: 'header', to: 'ghost', label: 'nowhere' },
        { from: 'header', to: 'helper', label: 'uses' },
      ],
    }),
    SPECS,
    FILES,
  )?.flow;
  expect(flow?.nodes).toEqual([
    {
      id: 'page',
      label: 'Campaign page',
      path: 'page.tsx',
      lines: { start: 3, end: 9 },
      changed: true,
    },
    { id: 'header', label: 'header.tsx', path: 'header.tsx', lines: null, changed: true },
    { id: 'helper', label: 'Shared helper', path: 'lib/threshold.ts', lines: null, changed: false },
  ]);
  expect(flow?.edges.map((edge) => edge.label)).toEqual(['passes the name', 'uses']);
});

test('a why keeps its source only when its quote is found there; else it is inferred', () => {
  const result = parseReport(
    answer({
      nodes: [{ id: 'page', path: 'page.tsx' }],
      steps: [
        step('spec', 'la table de palier'),
        step('commit', 'The name comes from the project'),
        step('comment', 'Load the project: the table name lives there'),
        step('commit', 'A message nobody wrote'),
        step('inferred', 'ignored'),
        step('oracle', ''),
        step('spec', 'x'),
      ],
    }),
    SPECS,
    FILES,
    COMMITS,
  );
  expect(result?.flow.steps.map((s) => [s.title, s.source, s.quote, s.nodes])).toEqual([
    ['spec', 'spec', 'la table de palier', ['page']],
    ['commit', 'commit', 'The name comes from the project', ['page']],
    ['comment', 'comment', 'Load the project: the table name lives there', ['page']],
    ['commit', 'inferred', null, ['page']],
    ['inferred', 'inferred', null, ['page']],
    ['oracle', 'inferred', null, ['page']],
  ]);
  // The made-up commit quote; the seventh step is past the sixth.
  expect(result?.dropped).toBe(1);
});

test('the checkout drops the nodes that are not there, with their edges, and cuts their lines', () => {
  const parsed = parseReport(
    answer({
      nodes: [
        { id: 'page', path: 'page.tsx', lines: { start: 1, end: 900 } },
        { id: 'ghost', path: 'lib/ghost.ts' },
        { id: 'helper', path: 'lib/threshold.ts' },
      ],
      edges: [
        { from: 'page', to: 'ghost', label: 'x' },
        { from: 'page', to: 'helper', label: 'uses' },
      ],
      steps: [{ title: 't', what: 'w', nodes: ['ghost', 'helper'] }],
    }),
    SPECS,
    FILES,
  );
  expect(parsed).not.toBeNull();
  if (!parsed) {
    return;
  }
  const counts = new Map([
    ['page.tsx', 40],
    ['lib/threshold.ts', 20],
  ]);
  const { flow, dropped } = keepInCheckout(parsed, counts, new Set(FILES.map((f) => f.path)));
  expect(flow.nodes.map((node) => [node.id, node.lines])).toEqual([
    ['page', { start: 1, end: 40 }],
    ['helper', null],
  ]);
  expect(flow.edges.map((edge) => edge.to)).toEqual(['helper']);
  expect(flow.steps[0]?.nodes).toEqual(['helper']);
  expect(dropped).toBe(parsed.dropped + 1);
});
