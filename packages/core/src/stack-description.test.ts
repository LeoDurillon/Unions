import { expect, test } from 'bun:test';

import {
  slicePrDescription,
  stackComment,
  stackReviewNote,
  stackSection,
  withStackSection,
  type StackEntry,
} from './stack-description';

const stack: StackEntry[] = [
  { position: 1, title: 'Database migration', prNumber: 101 },
  { position: 2, title: 'CRUD', prNumber: 102 },
  { position: 3, title: 'Frontend page', prNumber: 100 },
];

test('a slice describes its part of the spec, the stack around it and its issue', () => {
  const text = slicePrDescription({
    slice: { position: 2, title: 'CRUD', spec: 'Create, read, update, delete invoices.\n' },
    stack,
    issueNumber: 12,
  });
  expect(text).toBe(
    [
      '## CRUD',
      '',
      'Create, read, update, delete invoices.',
      '',
      '**Stack**, bottom first: merge from the bottom.',
      '',
      '1. #101 Database migration',
      '2. **#102 CRUD** (this pull request)',
      '3. #100 Frontend page',
      '',
      'Part of #12.',
    ].join('\n'),
  );
  expect(text).not.toContain('Closes');
});

test('a slice without a pull request yet is named by its title', () => {
  const opening = stack.map((entry) =>
    entry.position === 1 ? { ...entry, prNumber: null } : entry,
  );
  const text = slicePrDescription({
    slice: { position: 1, title: 'Database migration', spec: 'Tables.' },
    stack: opening,
    issueNumber: null,
  });
  expect(text).toContain('1. **Database migration** (this pull request)');
  expect(text).not.toContain('Part of');
});

test('the issue comment lists the stack bottom first', () => {
  expect(stackComment(stack)).toBe(
    'Split into a stack: #101 Database migration → #102 CRUD → #100 Frontend page',
  );
});

test('the top pull request gets the stack in a section of its own, replaced on a new split', () => {
  const first = withStackSection('Closes #12\n', stackSection(stack, 3));
  expect(first).toBe(
    [
      'Closes #12',
      '',
      '<!-- union:stack -->',
      '**Stack**, bottom first: merge from the bottom.',
      '',
      '1. #101 Database migration',
      '2. #102 CRUD',
      '3. **#100 Frontend page** (this pull request)',
      '<!-- /union:stack -->',
    ].join('\n'),
  );
  const again = withStackSection(`${first}\n\nMore text.`, 'New stack');
  expect(again).toBe(
    'Closes #12\n\n<!-- union:stack -->\nNew stack\n<!-- /union:stack -->\n\nMore text.',
  );
  expect(withStackSection('', 'S')).toBe('<!-- union:stack -->\nS\n<!-- /union:stack -->');
});

test('an agent reviewing a split ticket gets each slice with its range and its part of the spec', () => {
  const slices = [
    { position: 1, title: 'Migration', spec: 'The table.', tipSha: 'aaa' },
    { position: 2, title: 'CRUD', spec: 'Create\nand list.', tipSha: 'bbb' },
  ];
  const note = stackReviewNote(slices, 'main');
  expect(note).toContain(
    '1. **Migration**: `git diff main...aaa`. Its part of the spec: The table.',
  );
  expect(note).toContain(
    '2. **CRUD**: `git diff aaa...bbb`. Its part of the spec: Create and list.',
  );
  expect(stackReviewNote(slices.slice(0, 1), 'main')).toBe('');
});
