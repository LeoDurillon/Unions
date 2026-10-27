import { expect, test } from 'bun:test';

import { reportCounts, reportMarkdown } from './review-report-markdown';
import type { ReportSpec, ReviewReportResult } from './review-report-types';

const specs: ReportSpec[] = [{ id: 1, kind: 'notion', label: 'Notion: Campaigns', text: '…' }];

const report: ReviewReportResult = {
  verdict: 'partial',
  summary: 'Unpublishing is done; the tooltip is missing.',
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
      '## Important files',
      '',
      '1. `api/activate.ts:40-72`: The heart of the change.',
      '2. `api/publish.ts` (not changed): Its caller now skips drafts.',
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
    ].join('\n'),
  );
});
