// Tests of what a restart does to a review or reply left `sending`: back to the user, unless its command still waits.
import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { createDb, migrateDb, type Db } from './db';
import {
  recoverGitHubSends,
  REPLY_SEND_STOPPED,
  REVIEW_SEND_STOPPED,
} from './github-sends-recovery';
import * as schema from './tables';

let db: Db;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

function review(prNumber: number): number {
  return db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber,
      title: 'PR',
      url: 'u',
      author: 'a',
      headBranch: 'b',
      baseBranch: 'main',
      submitStatus: 'sending',
    })
    .returning()
    .get().id;
}

function reply(reviewId: number): number {
  return db
    .insert(schema.reviewComments)
    .values({
      reviewId,
      kind: 'general',
      path: '',
      side: 'new',
      startLine: 0,
      endLine: 0,
      excerpt: '',
      headSha: 'abc',
      status: 'sent',
      body: 'imported',
      replyStatus: 'sending',
      replyBody: 'Thanks, fixed.',
    })
    .returning()
    .get().id;
}

function command(type: string, payload: unknown, handled: boolean): void {
  db.insert(schema.commands)
    .values({ type, payload, handledAt: handled ? 1 : null })
    .run();
}

test('a send whose command the stopped worker had taken goes back to the user, with a note', () => {
  const cut = review(1);
  const cutReply = reply(cut);
  command('submit_pr_review', { reviewId: cut, summary: '', verdict: 'comment' }, true);
  expect(recoverGitHubSends(db)).toEqual({ reviews: 1, replies: 1 });
  expect(
    db.select().from(schema.currentReviews).where(eq(schema.currentReviews.id, cut)).get(),
  ).toMatchObject({ submitStatus: 'failed', submitError: REVIEW_SEND_STOPPED });
  expect(
    db.select().from(schema.reviewComments).where(eq(schema.reviewComments.id, cutReply)).get(),
  ).toMatchObject({
    replyStatus: 'draft',
    replyError: REPLY_SEND_STOPPED,
    replyBody: 'Thanks, fixed.',
  });
});

test('a send whose command still waits is left for the worker to post', () => {
  const waiting = review(2);
  const waitingReply = reply(waiting);
  command('submit_pr_review', { reviewId: waiting, summary: '', verdict: 'comment' }, false);
  command(
    'reply_pr_comment',
    { target: { kind: 'comment', commentId: waitingReply }, body: 'x', resolve: false },
    false,
  );
  expect(recoverGitHubSends(db)).toEqual({ reviews: 0, replies: 0 });
  expect(
    db.select().from(schema.currentReviews).where(eq(schema.currentReviews.id, waiting)).get()
      ?.submitStatus,
  ).toBe('sending');
});
