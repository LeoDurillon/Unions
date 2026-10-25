import { expect, test } from 'bun:test';

import { MAX_REPLY_LENGTH } from '@union/core';

import { importedNote, repliesOf, repliesPrompt, type RepliedComment } from './pr-reply-format';

const LINE: RepliedComment = {
  id: 12,
  kind: 'line',
  path: 'src/a.ts',
  side: 'new',
  startLine: 3,
  endLine: 5,
  body: '**@alice** on GitHub:\n\nRename this.',
};
const NOTE: RepliedComment = {
  id: 13,
  kind: 'general',
  path: '',
  side: 'new',
  startLine: 0,
  endLine: 0,
  body: '**@bob** commented on GitHub:\n\nAdd a test.',
};

function answer(replies: unknown): string {
  return `Done.\n\n\`\`\`json\n${JSON.stringify({ replies })}\n\`\`\``;
}

test('the prompt numbers each comment with its place, after the guidance', () => {
  const prompt = repliesPrompt('Be brief.', [LINE, NOTE]);
  expect(prompt.startsWith('Be brief.\n\n# Comments to reply to')).toBe(true);
  expect(prompt).toContain('## Comment 12: src/a.ts, lines 3-5\n\n**@alice** on GitHub:');
  expect(prompt).toContain('## Comment 13: on the pull request');
  expect(prompt).toContain('```json');
});

test('replies are read for the comments asked, once each, resolve only on lines', () => {
  const replies = repliesOf(
    answer([
      { id: 12, body: ' Renamed in 3f2a1c. ', resolve: true },
      { id: 12, body: 'Second try.' },
      { id: 13, body: 'Added in 9e8d7c.', resolve: true },
      { id: 99, body: 'Not asked.' },
      { id: 13, body: '' },
    ]),
    [LINE, NOTE],
  );
  expect(replies).toEqual([
    { id: 12, body: 'Renamed in 3f2a1c.', resolve: true },
    { id: 13, body: 'Added in 9e8d7c.', resolve: false },
  ]);
});

test('an empty, too long or unreadable answer gives no reply', () => {
  expect(repliesOf('No block.', [LINE])).toEqual([]);
  expect(repliesOf('```json\n{"replies": [\n```', [LINE])).toEqual([]);
  expect(repliesOf(answer([{ id: 12, body: 'x'.repeat(MAX_REPLY_LENGTH + 1) }]), [LINE])).toEqual(
    [],
  );
});

test('the last json block is the answer', () => {
  const text = `${answer([{ id: 12, body: 'Old.' }])}\n\n${answer([{ id: 12, body: 'New.' }])}`;
  expect(repliesOf(text, [LINE])).toEqual([{ id: 12, body: 'New.', resolve: false }]);
});

test('an imported note gives back its author and text; an edited one does not', () => {
  expect(importedNote(NOTE.body)).toEqual({ author: 'bob', body: 'Add a test.' });
  expect(importedNote('**@ci[bot]** reviewed on GitHub:\n\nLooks off.\n\nSee logs.')).toEqual({
    author: 'ci[bot]',
    body: 'Looks off.\n\nSee logs.',
  });
  expect(importedNote('Please add a test.')).toBeNull();
});
