// Tests queueing, claiming and finishing the turns of a review's Explain conversations.

import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, type Db } from '../db';
import * as schema from '../tables';
import { createTicket } from '../ticket/tickets';
import type { AgentReviewSpec } from './agent-review-specs';
import type { AgentReviewOwner } from './agent-reviews';
import {
  ConversationBusyError,
  conversationsOf,
  deleteConversation,
  renameConversation,
} from './explain-conversations';
import { conversationTitle } from './explain-subjects';
import {
  cancelQueuedExplanation,
  claimExplanation,
  explanationsOf,
  explanationThread,
  failInterruptedExplanations,
  finishExplanation,
  queueExplanation,
  UnknownConversationError,
  type ExplanationRequest,
} from './review-explanations';

let db: Db;
let first: AgentReviewOwner;
let second: AgentReviewOwner;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  first = { kind: 'ticket', id: createTicket(db, { projectId: project.id, title: 'a' }).id };
  second = { kind: 'ticket', id: createTicket(db, { projectId: project.id, title: 'b' }).id };
});

const SPEC: AgentReviewSpec = { kind: 'ticket', label: 'Ticket', text: 'Page the list.', prs: [] };

function ask(start: number, conversationId: number | null = null): ExplanationRequest {
  return {
    conversationId,
    subjects: [
      { kind: 'lines', path: 'src/a.ts', side: 'new', start, end: start + 2, excerpt: 'x' },
    ],
    question: null,
    specs: [SPEC],
    headSha: 'abc',
  };
}

const RESULT = { explanation: 'It pages.', specs: [], docs: [], notInSpec: null, dropped: 0 };

function answer(id: number, sessionId = 's1'): void {
  finishExplanation(db, id, { status: 'succeeded', result: RESULT, sessionId });
}

test('each new ask opens its own conversation, titled by its question or first subject', () => {
  queueExplanation(db, first, ask(1));
  queueExplanation(db, first, { ...ask(1), question: 'Why page?\nMore' });
  expect(conversationsOf(db, first).map((row) => row.title)).toEqual(['Why page?', 'src/a.ts:1-3']);
  expect(conversationTitle(null, [{ kind: 'change' }])).toBe('The whole change');
  expect(conversationTitle('x'.repeat(100), []).length).toBe(80);
});

test('one turn waits per conversation; another conversation of the review can queue meanwhile', () => {
  const root = queueExplanation(db, first, ask(1));
  expect(() => queueExplanation(db, first, ask(4, root.conversationId))).toThrow(
    ConversationBusyError,
  );
  queueExplanation(db, first, ask(1));
  claimExplanation(db);
  answer(root.id);
  const next = queueExplanation(db, first, { ...ask(4, root.conversationId), specs: null });
  expect(next.conversationId).toBe(root.conversationId);
  expect(next.specs).toEqual([SPEC]);
  expect(explanationThread(db, next).map((row) => row.id)).toEqual([root.id, next.id]);
});

test('a conversation of another review is refused', () => {
  const theirs = queueExplanation(db, second, ask(1));
  expect(() => queueExplanation(db, first, ask(1, theirs.conversationId))).toThrow(
    UnknownConversationError,
  );
});

test('the conversation asked in last comes first', () => {
  const older = queueExplanation(db, first, { ...ask(1), question: 'older' });
  queueExplanation(db, first, { ...ask(1), question: 'newer' });
  claimExplanation(db);
  answer(older.id);
  queueExplanation(db, first, ask(2, older.conversationId));
  expect(conversationsOf(db, first).map((row) => row.title)).toEqual(['older', 'newer']);
});

test('one turn runs per review at a time, other reviews go meanwhile', () => {
  const a = queueExplanation(db, first, ask(1));
  const b = queueExplanation(db, first, ask(10));
  const c = queueExplanation(db, second, ask(1));
  expect(claimExplanation(db)?.id).toBe(a.id);
  expect(claimExplanation(db)?.id).toBe(c.id);
  expect(claimExplanation(db)).toBeNull();
  answer(a.id);
  expect(claimExplanation(db)?.id).toBe(b.id);
});

test('a queued turn cancels here, a running one fails when the worker stopped', () => {
  const queued = queueExplanation(db, first, ask(1));
  expect(cancelQueuedExplanation(db, queued.id)).toBe(true);
  const running = queueExplanation(db, first, ask(10));
  claimExplanation(db);
  expect(cancelQueuedExplanation(db, running.id)).toBe(false);
  expect(failInterruptedExplanations(db).map((row) => row.id)).toEqual([running.id]);
  expect(explanationsOf(db, first).map((row) => row.status)).toEqual(['failed', 'cancelled']);
});

test('a conversation renames, and deletes with its turns once none waits', () => {
  const turn = queueExplanation(db, first, ask(1));
  const [conversation] = conversationsOf(db, first);
  if (!conversation) {
    throw new Error('no conversation');
  }
  expect(renameConversation(db, conversation, '  Paging  ').title).toBe('Paging');
  expect(() => {
    deleteConversation(db, conversation);
  }).toThrow(ConversationBusyError);
  cancelQueuedExplanation(db, turn.id);
  deleteConversation(db, conversation);
  expect(conversationsOf(db, first)).toEqual([]);
  expect(explanationsOf(db, first)).toEqual([]);
});
