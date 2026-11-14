// Tests reading the seams agent's groups of the same problem and numbering the parts' comments.

import { expect, test } from 'bun:test';

import type { Findings } from './agent-review-findings';
import type { PartAnswer } from './agent-review-merge';
import { numberedFindings, parseSame } from './agent-review-same';

function comment(path: string, line: number): Findings['comments'][number] {
  return { pr: null, path, side: 'new', startLine: line, endLine: line, body: 'b' };
}

test('the parts comments are numbered part after part; a failed part has none', () => {
  const parts: PartAnswer[] = [
    {
      title: 'A',
      findings: { summary: '', comments: [comment('a', 1), comment('a', 2)] },
      error: null,
    },
    { title: 'B', findings: null, error: 'limit' },
    { title: 'C', findings: { summary: '', comments: [comment('c', 1)] }, error: null },
  ];
  expect(numberedFindings(parts).map(({ number, part }) => [number, part])).toEqual([
    [1, 0],
    [2, 0],
    [3, 2],
  ]);
});

function block(value: unknown): string {
  return `x\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
}

test('same: only lists of whole numbers are read, and none without the field', () => {
  expect(parseSame(block({ same: [[1, 4], 'x', [2, 1.5]], comments: [] }))).toEqual([[1, 4]]);
  expect(parseSame(block({ comments: [] }))).toEqual([]);
  expect(parseSame('no block')).toEqual([]);
});
