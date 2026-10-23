import { expect, test } from 'bun:test';

import { formatReview, formatStackReview } from './review-feedback';

test('comments are grouped by file with their lines and code excerpt', () => {
  const text = formatReview(
    [
      {
        kind: 'line',
        path: 'math.js',
        side: 'new',
        startLine: 5,
        endLine: 7,
        excerpt: 'export function subtract',
        body: 'Validate inputs.',
      },
      {
        kind: 'line',
        path: 'math.test.js',
        side: 'new',
        startLine: 3,
        endLine: 3,
        excerpt: 'import x',
        body: 'Unused import.',
      },
      {
        kind: 'line',
        path: 'math.js',
        side: 'old',
        startLine: 2,
        endLine: 2,
        excerpt: 'return a + b;',
        body: 'Why removed?',
      },
    ],
    'Nice start.',
  );
  expect(text).toBe(
    [
      '# Code review from the user',
      'Nice start.',
      '## math.js',
      '**Lines 5-7**\n\n```\nexport function subtract\n```\n\nValidate inputs.',
      '**Line 2 (removed code)**\n\n```\nreturn a + b;\n```\n\nWhy removed?',
      '## math.test.js',
      '**Line 3**\n\n```\nimport x\n```\n\nUnused import.',
    ].join('\n\n'),
  );
});

test('a summary alone is a valid review', () => {
  expect(formatReview([], 'Please split the PR.')).toBe(
    '# Code review from the user\n\nPlease split the PR.',
  );
});

test('comments on the whole pull request come before the files, without lines or excerpt', () => {
  const general = {
    kind: 'general' as const,
    path: '',
    side: 'new' as const,
    startLine: 0,
    endLine: 0,
    excerpt: '',
  };
  const line = { ...general, kind: 'line' as const, path: 'a.js', startLine: 1, endLine: 1 };
  expect(
    formatReview(
      [
        { ...line, excerpt: 'x', body: 'Rename.' },
        { ...general, body: '**@bot** reviewed on GitHub:\n\nNitpick.' },
      ],
      '',
    ),
  ).toBe(
    [
      '# Code review from the user',
      '## On the pull request',
      '**@bot** reviewed on GitHub:\n\nNitpick.',
      '## a.js',
      '**Line 1**\n\n```\nx\n```\n\nRename.',
    ].join('\n\n'),
  );
});

test('on a split ticket, each commented file says which slices change it', () => {
  const text = formatReview(
    [
      {
        kind: 'line',
        path: 'math.js',
        side: 'new',
        startLine: 2,
        endLine: 2,
        excerpt: 'x',
        body: 'Rename it.',
      },
    ],
    '',
    (path) => (path === 'math.js' ? ['slice 1 (Math)', 'slice 2 (Tidy)'] : []),
  );
  expect(text).toContain('## math.js\n\nChanged in slice 1 (Math) and slice 2 (Tidy).');
});

test("a split ticket's review: the whole change first, then each slice's own comments", () => {
  const line = { kind: 'line', side: 'new', startLine: 4, endLine: 4, excerpt: 'x' } as const;
  const text = formatStackReview(
    [
      { ...line, path: 'a.ts', body: 'On the whole.', slicePosition: null },
      { ...line, path: 'b.ts', body: 'On slice 2.', slicePosition: 2 },
      { ...line, path: 'c.ts', body: 'Of a slice gone.', slicePosition: 9 },
      { ...line, kind: 'general', path: '', body: 'Split it more.', slicePosition: 2 },
    ],
    '',
    [
      { position: 1, title: 'Schema', sha: 'aaaaaaaaaa', prNumber: 11 },
      { position: 2, title: 'API', sha: 'bbbbbbbbbb', prNumber: 12 },
    ],
    (path) => (path === 'a.ts' ? ['slice 1 (Schema)'] : []),
  );
  expect(text).toBe(
    [
      '# Code review from the user',
      '## a.ts\n\nChanged in slice 1 (Schema).',
      '**Line 4**\n\n```\nx\n```\n\nOn the whole.',
      '## c.ts',
      '**Line 4**\n\n```\nx\n```\n\nOf a slice gone.',
      "## Slice 2: API (#12)\n\nOn this slice's own change: line numbers are at its tip (`bbbbbbb`). Fix these in slice 2.",
      '### On the pull request',
      'Split it more.',
      '### b.ts',
      '**Line 4**\n\n```\nx\n```\n\nOn slice 2.',
    ].join('\n\n'),
  );
});
