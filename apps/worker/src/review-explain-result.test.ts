// Tests reading the agent's explanation block and dropping the citations it cannot back.
import { expect, test } from 'bun:test';

import type { AgentReviewSpec } from '@union/core';

import { keepDocs, parseExplanation } from './review-explain-result';

const SPECS: AgentReviewSpec[] = [
  { kind: 'pr', label: 'PR description', text: 'Exports over 10k rows\n  are paged.', prs: [] },
];

function answer(block: unknown): string {
  return `Some thoughts.\n\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\``;
}

test('keeps a quote found in a spec sent, whitespace and case aside', () => {
  const result = parseExplanation(
    answer({
      explanation: 'Pages the rows.',
      specs: [
        { source: 'PR description', quote: 'exports over 10k rows are paged', how: 'By 500.' },
        { source: 'PR description', quote: 'Rows are sorted', how: '' },
        { source: 'Notion: Export', quote: 'Exports over 10k rows', how: '' },
      ],
      docs: [],
    }),
    SPECS,
  );
  expect(result?.specs).toEqual([
    { source: 'PR description', quote: 'exports over 10k rows are paged', how: 'By 500.' },
  ]);
  expect(result?.dropped).toBe(2);
  expect(result?.notInSpec).toBeNull();
});

test('drops docs outside the checkout, then the ones it does not hold', () => {
  const parsed = parseExplanation(
    answer({
      explanation: 'x',
      docs: [
        { path: './docs/spec/export.md', heading: 'Limits', why: 'Page size.' },
        { path: '../secrets', heading: '', why: '' },
        { path: 'docs/gone.md', heading: '', why: '' },
      ],
      notInSpec: 'Nothing asks for it.',
    }),
    SPECS,
  );
  expect(parsed?.docs.map((doc) => doc.path)).toEqual(['docs/spec/export.md', 'docs/gone.md']);
  expect(parsed?.notInSpec).toBe('Nothing asks for it.');
  const kept = parsed ? keepDocs(parsed, new Set(['docs/spec/export.md'])) : null;
  expect(kept?.docs.map((doc) => doc.path)).toEqual(['docs/spec/export.md']);
  expect(kept?.dropped).toBe(2);
});

test('an answer without the block reads as none', () => {
  expect(parseExplanation('It pages the rows.', SPECS)).toBeNull();
  expect(parseExplanation('```json\n{"groups": []}\n```', SPECS)).toBeNull();
});
