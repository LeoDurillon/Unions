// Tests the conversation list's search and states, and reading the open conversation from the URL.

import { expect, test } from 'bun:test';

import type {
  ConversationView,
  ExplanationView,
} from '../../../src/routes/review/explanation-views';
import { conversationState, searchConversations } from './conversation-list';
import { pickOf } from './open-conversation';

function conversation(id: number, title: string, turn: Partial<ExplanationView>): ConversationView {
  const base: ExplanationView = {
    id,
    conversationId: id,
    subjects: [],
    question: null,
    headSha: 'h',
    status: 'succeeded',
    result: null,
    error: null,
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
    specs: [],
    outdated: false,
    specParts: [],
    partsOutdated: false,
  };
  return { id, title, createdAt: 1, updatedAt: 1, turns: [{ ...base, ...turn }] };
}

const LIST = [
  conversation(1, 'src/a.ts:3-5', { question: 'Why does it page?' }),
  conversation(2, 'Retries', { status: 'running' }),
  conversation(3, 'Old', { outdated: true }),
];

test('the search matches every word in the title or the questions', () => {
  expect(searchConversations(LIST, 'page why').map((row) => row.id)).toEqual([1]);
  expect(searchConversations(LIST, 'RETRIES').map((row) => row.id)).toEqual([2]);
  expect(searchConversations(LIST, '  ').map((row) => row.id)).toEqual([1, 2, 3]);
});

test("a conversation's state is its last question's", () => {
  expect(LIST.map((row) => conversationState(row).tone)).toEqual(['green', 'blue', 'amber']);
  expect(LIST.map((row) => conversationState(row).active)).toEqual([false, true, false]);
});

test('the URL names a conversation, a new one, or none', () => {
  expect(pickOf('12')).toBe(12);
  expect(pickOf('new')).toBe('new');
  expect([pickOf(null), pickOf('0'), pickOf('x'), pickOf('1.5')]).toEqual([null, null, null, null]);
});
