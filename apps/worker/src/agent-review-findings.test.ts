import { expect, test } from 'bun:test';

import { parseFindings, toDrafts } from './agent-review-findings';

const PATCH = '@@ -1,3 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n const c = 4;';

function answer(json: string): string {
  return `I read the change.\n\n\`\`\`json\n${json}\n\`\`\`\n`;
}

test('the findings are read from the last json block; incomplete comments are dropped', () => {
  const text = `${answer('{"comments": []}')}\nOn second thought:\n${answer(
    JSON.stringify({
      summary: ' Overall fine. ',
      comments: [
        { path: 'a.ts', side: 'new', startLine: 2, body: 'Why 3?' },
        { path: 'a.ts', startLine: 4, endLine: 2, body: 'Reversed range.' },
        { path: 'a.ts', startLine: 2 },
        { path: '', startLine: 2, body: 'No file.' },
        'not an object',
      ],
    }),
  )}`;
  expect(parseFindings(text)).toEqual({
    summary: 'Overall fine.',
    comments: [
      { path: 'a.ts', side: 'new', startLine: 2, endLine: 2, body: 'Why 3?' },
      { path: 'a.ts', side: 'new', startLine: 2, endLine: 4, body: 'Reversed range.' },
    ],
  });
});

test('an answer without a valid block has no findings', () => {
  expect(parseFindings('Looks good to me.')).toBeNull();
  expect(parseFindings(answer('{not json'))).toBeNull();
  expect(parseFindings(answer('{"summary": "x"}'))).toBeNull();
});

test('findings on the diff become line drafts; the others keep their place in the text', () => {
  const drafts = toDrafts(
    {
      summary: 'Overall fine.',
      comments: [
        { path: 'a.ts', side: 'new', startLine: 2, endLine: 2, body: 'Why 3?' },
        { path: 'a.ts', side: 'old', startLine: 2, endLine: 2, body: 'Keep 2.' },
        { path: 'a.ts', side: 'new', startLine: 40, endLine: 41, body: 'Far away.' },
        { path: 'other.ts', side: 'new', startLine: 1, endLine: 1, body: 'Not changed.' },
      ],
    },
    (path) => (path === 'a.ts' ? PATCH : undefined),
  );
  expect(drafts.map(({ kind, side, excerpt, body }) => ({ kind, side, excerpt, body }))).toEqual([
    { kind: 'general', side: 'new', excerpt: '', body: 'Overall fine.' },
    { kind: 'line', side: 'new', excerpt: 'const b = 3;', body: 'Why 3?' },
    { kind: 'line', side: 'old', excerpt: 'const b = 2;', body: 'Keep 2.' },
    { kind: 'general', side: 'new', excerpt: '', body: '**a.ts**, lines 40-41:\n\nFar away.' },
    { kind: 'general', side: 'new', excerpt: '', body: '**other.ts**, line 1:\n\nNot changed.' },
  ]);
});
