import { expect, test } from 'bun:test';

import { reportCounts, reportGaps, reportMarkdown } from './review-report-markdown';
import type { ReportSpec, ReviewReportResult } from './review-report-types';

const specs: ReportSpec[] = [{ id: 1, kind: 'notion', label: 'Notion: Campaigns', text: '…' }];

const report: ReviewReportResult = {
  verdict: 'partial',
  summary: 'Unpublishing is done; the tooltip is missing.',
  flow: {
    nodes: [
      { id: 'card', label: 'Card', path: 'ui/card.tsx', lines: null, changed: true },
      { id: 'activate', label: 'Activation', path: 'api/activate.ts', lines: null, changed: true },
    ],
    edges: [{ from: 'card', to: 'activate', label: 'calls' }],
    steps: [
      {
        title: 'Activation unpublishes.',
        what: 'In one transaction.',
        why: 'So no two scenarios are live.',
        source: 'commit',
        quote: 'keep **one** live',
        nodes: ['activate'],
      },
    ],
  },
  attention: [
    {
      kind: 'missing',
      title: 'No tooltip',
      detail: 'The spec asks for one.',
      requirement: 'tooltip',
      cites: [{ path: 'ui/card.tsx', start: 3, end: 9 }],
    },
  ],
  importantFiles: [
    {
      path: 'api/activate.ts',
      why: 'The heart of the change.',
      kind: 'core',
      lines: [{ start: 40, end: 72 }],
      requirements: ['unpublish'],
      unchanged: false,
    },
    {
      path: 'api/publish.ts',
      why: 'Its caller now skips drafts.',
      kind: 'risky',
      lines: [],
      requirements: [],
      unchanged: true,
    },
  ],
  skim: [{ path: 'api/index.ts', why: 'Exports only.' }],
  requirements: [
    {
      key: 'unpublish',
      title: 'Automatic unpublishing',
      spec: 'Unpublish the others\non activation',
      specId: 1,
      status: 'done',
      evidence: [{ path: 'api/activate.ts', start: 40, end: 40 }],
      tests: ['api/activate.test.ts'],
      note: '',
    },
    {
      key: 'tooltip',
      title: 'Tooltip',
      spec: null,
      specId: null,
      status: 'missing',
      evidence: [],
      tests: [],
      note: 'No change found.',
    },
  ],
  outOfScope: [{ path: 'package.json', hunks: [], reason: 'Dependency bump', risk: 'low' }],
  risks: [],
  questions: ['Should drafts stay published?'],
  docs: [],
  unreviewed: ['README.md'],
  dropped: 0,
};

test('counts the statuses present, then what the spec did not ask for', () => {
  expect(reportCounts(report)).toBe('1 done · 1 missing · 1 not in the spec');
});

test('writes the report in its reading order, leaving out empty sections', () => {
  expect(reportMarkdown(report, specs)).toBe(
    [
      '# Partly matches the specs',
      '',
      'Unpublishing is done; the tooltip is missing.',
      '',
      '1 done · 1 missing · 1 not in the spec',
      '',
      '## How it works',
      '',
      '1. **Activation unpublishes.** In one transaction.',
      '   Why (a commit): So no two scenarios are live. > keep one live',
      '',
      '- Card → Activation: calls',
      '',
      '## Needs you',
      '',
      '1. **No tooltip** (missing)',
      '   The spec asks for one.',
      '   `ui/card.tsx:3-9`',
      '',
      '## Important files',
      '',
      '1. `api/activate.ts:40-72`: The heart of the change.',
      '2. `api/publish.ts` (not changed): Its caller now skips drafts.',
      '',
      '## Skim',
      '',
      '- `api/index.ts`: Exports only.',
      '',
      '## Requirements',
      '',
      '### Automatic unpublishing: Done',
      '',
      '> Unpublish the others',
      '> on activation',
      '> — Notion: Campaigns',
      '',
      'Code: `api/activate.ts:40`',
      'Tests: `api/activate.test.ts`',
      '',
      '### Tooltip: Missing',
      '',
      'Tests: none',
      '',
      'No change found.',
      '',
      '## Not in the spec',
      '',
      '- `package.json` (low risk): Dependency bump',
      '',
      '## Questions',
      '',
      '- Should drafts stay published?',
      '',
      '## Not looked at by the agent',
      '',
      '- `README.md`',
    ].join('\n'),
  );
});

test('the gaps are the requirements missing, partial or done differently, with their note and quote', () => {
  expect(reportGaps(report, specs)).toBe(
    [
      'The spec report found these requirements not met:',
      '',
      '- **Tooltip** (missing)',
      '  No change found.',
    ].join('\n'),
  );
  const differs = {
    ...report,
    requirements: report.requirements.map((item) =>
      item.key === 'unpublish'
        ? { ...item, status: 'differs' as const, note: 'On save, not on activation.' }
        : item,
    ),
  };
  expect(reportGaps(differs, specs)?.split('\n').slice(2, 6)).toEqual([
    '- **Automatic unpublishing** (done differently)',
    '  On save, not on activation.',
    '  > Unpublish the others',
    '  > on activation (Notion: Campaigns)',
  ]);
  expect(
    reportGaps({ ...report, requirements: report.requirements.slice(0, 1) }, specs),
  ).toBeNull();
});
