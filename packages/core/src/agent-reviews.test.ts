import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import {
  AgentReviewBusyError,
  cancelQueuedAgentReview,
  claimAgentReview,
  failInterruptedAgentReviews,
  finishAgentReview,
  latestAgentReview,
  queueAgentReview,
  type AgentDraft,
} from './agent-reviews';
import { createDb, migrateDb, type Db } from './db';
import * as schema from './tables';
import { createTicket } from './tickets';

let db: Db;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
});

const owner = (): { kind: 'ticket'; id: number } => ({ kind: 'ticket', id: ticketId });

function finding(body: string): AgentDraft {
  return { kind: 'line', path: 'a.ts', side: 'new', startLine: 1, endLine: 1, excerpt: 'x', body };
}

function drafts(): { body: string; author: string }[] {
  return db
    .select()
    .from(schema.reviewComments)
    .orderBy(schema.reviewComments.id)
    .all()
    .map(({ body, author }) => ({ body, author }));
}

function addUserDraft(body: string): void {
  db.insert(schema.reviewComments)
    .values({ ...finding(body), ticketId, headSha: 'h0' })
    .run();
}

test('one review at a time per owner, claimed oldest first', () => {
  const first = queueAgentReview(db, owner());
  expect(() => queueAgentReview(db, owner())).toThrow(AgentReviewBusyError);
  expect(claimAgentReview(db)).toMatchObject({ id: first.id, status: 'running' });
  expect(claimAgentReview(db)).toBeNull();
  expect(() => queueAgentReview(db, owner())).toThrow(AgentReviewBusyError);
});

test('a new run replaces only the suggestions the user did not keep or edit', () => {
  addUserDraft('mine');
  const first = queueAgentReview(db, owner());
  finishAgentReview(db, first.id, {
    status: 'succeeded',
    headSha: 'h1',
    drafts: [finding('old suggestion'), finding('kept suggestion')],
  });
  // Keeping (or editing) a suggestion makes it the user's.
  db.update(schema.reviewComments)
    .set({ author: 'user' })
    .where(eq(schema.reviewComments.body, 'kept suggestion'))
    .run();

  const second = queueAgentReview(db, owner());
  finishAgentReview(db, second.id, {
    status: 'succeeded',
    headSha: 'h2',
    drafts: [finding('new suggestion')],
  });
  expect(drafts()).toEqual([
    { body: 'mine', author: 'user' },
    { body: 'kept suggestion', author: 'user' },
    { body: 'new suggestion', author: 'agent' },
  ]);
  expect(latestAgentReview(db, owner())).toMatchObject({ status: 'succeeded', comments: 1 });
});

test('a failed run keeps the earlier suggestions', () => {
  const first = queueAgentReview(db, owner());
  finishAgentReview(db, first.id, { status: 'succeeded', headSha: 'h1', drafts: [finding('s')] });
  const second = queueAgentReview(db, owner());
  finishAgentReview(db, second.id, { status: 'failed', error: 'no comments block' });
  expect(drafts()).toEqual([{ body: 's', author: 'agent' }]);
  expect(latestAgentReview(db, owner())).toMatchObject({
    status: 'failed',
    error: 'no comments block',
  });
});

test('a queued review cancels at once; a running one is left to the runner, or failed on restart', () => {
  const queued = queueAgentReview(db, owner());
  expect(cancelQueuedAgentReview(db, queued.id)).toBe(true);
  const running = queueAgentReview(db, owner());
  claimAgentReview(db);
  expect(cancelQueuedAgentReview(db, running.id)).toBe(false);
  expect(failInterruptedAgentReviews(db).map((review) => review.id)).toEqual([running.id]);
  expect(latestAgentReview(db, owner())?.status).toBe('failed');
});
