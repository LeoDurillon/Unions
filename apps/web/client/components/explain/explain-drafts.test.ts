// Tests adding parts of the diff to a conversation's draft, and which conversations Add to offers.

import { expect, test } from 'bun:test';

import type { ConversationView } from '../../../src/routes/review/explanation-views';
import { withSubject } from './explain-drafts';
import { offeredConversations } from './explain-split';

const LINES = { kind: 'lines' as const, path: 'a.ts', side: 'new' as const, start: 3, end: 5 };

test('a subject is added once, without the text the server keeps, and questions add up', () => {
  // A turn's lines, as the server returns them, carry their text.
  const shown = { ...LINES, excerpt: 'x' };
  const first = withSubject({ subjects: [], question: '' }, shown, 'Why?');
  expect(first).toEqual({ subjects: [LINES], question: 'Why?' });
  const again = withSubject(first, LINES, null);
  expect(again.subjects).toEqual([LINES]);
  const more = withSubject(again, { kind: 'file', path: 'b.ts' }, ' And b? ');
  expect(more).toEqual({
    subjects: [LINES, { kind: 'file', path: 'b.ts' }],
    question: 'Why?\nAnd b?',
  });
});

function conversation(id: number): ConversationView {
  return { id, title: `c${id}`, createdAt: id, updatedAt: id, turns: [] };
}

test('Add to offers the current conversation first, then the latest, four at most', () => {
  const list = [5, 4, 3, 2, 1].map((id) => conversation(id));
  expect(offeredConversations(list, 2).map((row) => row.id)).toEqual([2, 5, 4, 3]);
  expect(offeredConversations(list, null).map((row) => row.id)).toEqual([5, 4, 3, 2]);
  expect(offeredConversations(list, 99).map((row) => row.id)).toEqual([5, 4, 3, 2]);
});
