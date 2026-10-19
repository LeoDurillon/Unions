// Tests queueing, claiming and finishing the explanations of a review's lines.
import { beforeEach, expect, test } from 'bun:test';

import type { AgentReviewOwner } from './agent-reviews';
import { createDb, migrateDb, type Db } from './db';
import {
  cancelQueuedExplanation,
  claimExplanation,
  explanationsOf,
  explanationThread,
  ExplanationBusyError,
  failInterruptedExplanations,
  finishExplanation,
  queueExplanation,
  type ExplanationRequest,
} from './review-explanations';
import * as schema from './tables';
import { createTicket } from './tickets';

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

function ask(start: number, parentId: number | null = null): ExplanationRequest {
  return {
    path: 'src/a.ts',
    side: 'new',
    start,
    end: start + 2,
    excerpt: 'code',
    question: null,
    specs: [],
    headSha: 'abc',
    parentId,
  };
}

const RESULT = { explanation: 'It pages.', specs: [], docs: [], notInSpec: null, dropped: 0 };

test('the same lines are refused while they wait, other lines queue', () => {
  queueExplanation(db, first, ask(1));
  expect(() => queueExplanation(db, first, ask(1))).toThrow(ExplanationBusyError);
  queueExplanation(db, first, ask(10));
  expect(explanationsOf(db, first).map((row) => row.startLine)).toEqual([10, 1]);
});

test('one explanation runs per review at a time, other reviews go meanwhile', () => {
  const a = queueExplanation(db, first, ask(1));
  const b = queueExplanation(db, first, ask(10));
  const c = queueExplanation(db, second, ask(1));
  expect(claimExplanation(db)?.id).toBe(a.id);
  expect(claimExplanation(db)?.id).toBe(c.id);
  expect(claimExplanation(db)).toBeNull();
  finishExplanation(db, a.id, { status: 'succeeded', result: RESULT, sessionId: 's1' });
  expect(claimExplanation(db)?.id).toBe(b.id);
});

test('a follow-up threads under its parent and keeps the session of the answer', () => {
  const root = queueExplanation(db, first, ask(1));
  claimExplanation(db);
  finishExplanation(db, root.id, { status: 'succeeded', result: RESULT, sessionId: 's1' });
  const follow = queueExplanation(db, first, { ...ask(1, root.id), question: 'Why?' });
  expect(() => queueExplanation(db, first, ask(1, root.id))).toThrow(ExplanationBusyError);
  const thread = explanationThread(db, follow);
  expect(thread.map((row) => row.id)).toEqual([root.id, follow.id]);
  expect(thread[0]?.sessionId).toBe('s1');
});

test('a queued explanation cancels here, a running one fails when the worker stopped', () => {
  const queued = queueExplanation(db, first, ask(1));
  expect(cancelQueuedExplanation(db, queued.id)).toBe(true);
  const running = queueExplanation(db, first, ask(10));
  claimExplanation(db);
  expect(cancelQueuedExplanation(db, running.id)).toBe(false);
  expect(failInterruptedExplanations(db).map((row) => row.id)).toEqual([running.id]);
  expect(explanationsOf(db, first).map((row) => row.status)).toEqual(['failed', 'cancelled']);
});
