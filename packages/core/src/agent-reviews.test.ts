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
  agentReviewStack,
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

/** Three pull requests under review, as a stack would be: their review ids, bottom first. */
function stackReviews(): number[] {
  const projectId = db.select().from(schema.projects).get()?.id ?? 0;
  return [12, 13, 14].map(
    (prNumber) =>
      db
        .insert(schema.currentReviews)
        .values({
          projectId,
          prNumber,
          title: 't',
          url: 'u',
          author: 'a',
          headBranch: `b${prNumber}`,
          baseBranch: 'main',
        })
        .returning()
        .get().id,
  );
}

function reviewDrafts(reviewId: number): string[] {
  return db
    .select()
    .from(schema.reviewComments)
    .where(eq(schema.reviewComments.reviewId, reviewId))
    .all()
    .map((comment) => `${comment.body}@${comment.headSha}`);
}

test("a stack's run covers each of its reviews: busy, latest and drafts for every one", () => {
  const [bottom = 0, middle = 0, top = 0] = stackReviews();
  const run = queueAgentReview(db, { kind: 'review', id: bottom }, [], [bottom, middle, top]);
  expect(agentReviewStack(db, run.id).map((member) => member.prNumber)).toEqual([12, 13, 14]);
  expect(latestAgentReview(db, { kind: 'review', id: top })?.id).toBe(run.id);
  expect(() => queueAgentReview(db, { kind: 'review', id: middle })).toThrow(AgentReviewBusyError);

  finishAgentReview(db, run.id, {
    status: 'succeeded',
    headSha: 'h12',
    drafts: [finding('on 12')],
    others: [
      { reviewId: middle, headSha: 'h13', drafts: [] },
      { reviewId: top, headSha: 'h14', drafts: [finding('on 14'), finding('the stack')] },
    ],
  });
  expect(reviewDrafts(bottom)).toEqual(['on 12@h12']);
  expect(reviewDrafts(middle)).toEqual([]);
  expect(reviewDrafts(top)).toEqual(['on 14@h14', 'the stack@h14']);
  expect(latestAgentReview(db, { kind: 'review', id: middle })).toMatchObject({ comments: 3 });

  const single = queueAgentReview(db, { kind: 'review', id: top });
  expect(agentReviewStack(db, single.id)).toEqual([]);
  expect(() => queueAgentReview(db, { kind: 'review', id: bottom }, [], [bottom, top])).toThrow(
    AgentReviewBusyError,
  );
});
