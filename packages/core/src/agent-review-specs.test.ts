import { expect, test } from 'bun:test';

import {
  MAX_SPEC_CHARS,
  MAX_SPECS,
  parseAgentReviewSpecs,
  specsSection,
} from './agent-review-specs';

function refusal(value: unknown): string {
  const parsed = parseAgentReviewSpecs(value);
  return 'error' in parsed ? parsed.error : '';
}

test('specs are read with their text trimmed and their pull requests once each', () => {
  expect(
    parseAgentReviewSpecs([
      { kind: 'pr', label: ' PR #12 description ', text: ' Add a schema. ', prs: [12, 12, 13] },
      { kind: 'notion', label: 'Notion: Tax notice', text: 'Rules.' },
    ]),
  ).toEqual({
    specs: [
      { kind: 'pr', label: 'PR #12 description', text: 'Add a schema.', prs: [12, 13] },
      { kind: 'notion', label: 'Notion: Tax notice', text: 'Rules.', prs: [] },
    ],
  });
  expect(parseAgentReviewSpecs([])).toEqual({ specs: [] });
});

test('a bad spec is refused with its position', () => {
  expect(refusal('x')).toBe('"specs" must be a list');
  expect(refusal([{ kind: 'wiki', label: 'a', text: 'b' }])).toContain('Spec 1: "kind"');
  expect(
    refusal([
      { kind: 'pr', label: 'a', text: 'b' },
      { kind: 'pr', label: 'a', text: ' ' },
    ]),
  ).toBe('Spec 2: a label and a text are needed');
  expect(refusal([{ kind: 'pr', label: 'a', text: 'b', prs: [0] }])).toContain('"prs"');
  expect(refusal([{ kind: 'pr', label: 'a', text: 'x'.repeat(MAX_SPEC_CHARS + 1) }])).toContain(
    'longer than',
  );
  const many = Array.from({ length: MAX_SPECS + 1 }, () => ({ kind: 'pr', label: 'a', text: 'b' }));
  expect(refusal(many)).toBe(`At most ${MAX_SPECS} specs`);
});

test('the prompt numbers the specs and says which pull requests implement each', () => {
  const section = specsSection([
    { kind: 'pr', label: 'PR #12 description', text: 'Add a schema.', prs: [12] },
    { kind: 'issue', label: 'Issue #4: Tax notices', text: 'Users upload notices.', prs: [12, 13] },
    { kind: 'notion', label: 'Notion: Rules', text: 'Keep files 10 years.', prs: [] },
  ]);
  expect(section).toStartWith('## Specifications');
  expect(section).toContain('### Spec 1: PR #12 description (implemented by #12)\n\nAdd a schema.');
  expect(section).toContain('### Spec 2: Issue #4: Tax notices (implemented by #12, #13)');
  expect(section).toContain('### Spec 3: Notion: Rules\n\nKeep files 10 years.');
  expect(specsSection([])).toBe('');
});
