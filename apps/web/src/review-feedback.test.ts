import { expect, test } from 'bun:test';

import { formatReview } from './review-feedback';

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
