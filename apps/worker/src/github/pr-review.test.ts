import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi } from './api';
import { FakeGitHubApi } from './fake-api';
import { postPullRequestReview } from './pr-review';

let db: Db;
let api: FakeGitHubApi;
let reviewId: number;

function draft(input: {
  path?: string;
  side?: 'old' | 'new';
  startLine: number;
  endLine?: number;
  body: string;
  headSha?: string;
}): void {
  db.insert(schema.reviewComments)
    .values({
      reviewId,
      path: input.path ?? 'src/a.ts',
      side: input.side ?? 'new',
      startLine: input.startLine,
      endLine: input.endLine ?? input.startLine,
      excerpt: `code at ${input.startLine}`,
      body: input.body,
      headSha: input.headSha ?? 'h2',
    })
    .run();
}

function statuses(): string[] {
  return db
    .select()
    .from(schema.reviewComments)
    .all()
    .map((row) => row.status);
}

function review(): typeof schema.currentReviews.$inferSelect | undefined {
  return db.select().from(schema.currentReviews).get();
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  const project = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get();
  reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId: project.id,
      prNumber: 42,
      title: 't',
      url: 'u',
      author: 'a',
      headBranch: 'h',
      baseBranch: 'main',
      headSha: 'h2',
      submitStatus: 'sending',
    })
    .returning()
    .get().id;
});

test('drafts on the reviewed commit become line comments, older ones are quoted', async () => {
  draft({ startLine: 3, body: 'Rename this.' });
  draft({ side: 'old', startLine: 10, endLine: 12, body: 'Why remove these?' });
  draft({ path: 'src/b.ts', startLine: 7, body: 'Typo.', headSha: 'h1' });

  await postPullRequestReview(db, () => api, reviewId, {
    summary: 'Looks good overall.',
    verdict: 'comment',
  });

  const [posted] = api.reviews;
  expect(posted).toMatchObject({ number: 42, commitId: 'h2', verdict: 'comment' });
  expect(posted?.comments).toEqual([
    { path: 'src/a.ts', body: 'Rename this.', side: 'RIGHT', line: 3 },
    { path: 'src/a.ts', body: 'Why remove these?', side: 'LEFT', line: 12, startLine: 10 },
  ]);
  expect(posted?.body).toBe(
    'Looks good overall.\n\n### On an earlier version of the pull request\n\n**src/b.ts**, line 7:\n\n```\ncode at 7\n```\n\nTypo.',
  );
  expect(statuses()).toEqual(['sent', 'sent', 'sent']);
  expect(review()).toMatchObject({ submitStatus: null, submitError: null });
  expect(
    db
      .select()
      .from(schema.events)
      .all()
      .map((event) => event.type),
  ).toContain('pr_review_posted');
});

test('comments on the whole pull request follow the summary in the body', async () => {
  draft({ startLine: 3, body: 'Rename this.' });
  db.insert(schema.reviewComments)
    .values({
      reviewId,
      kind: 'general',
      path: '',
      side: 'new',
      startLine: 0,
      endLine: 0,
      excerpt: '',
      body: 'The cache is never invalidated.',
      headSha: 'h1',
    })
    .run();

  await postPullRequestReview(db, () => api, reviewId, { summary: 'Summary.', verdict: 'comment' });

  const [posted] = api.reviews;
  expect(posted?.comments).toHaveLength(1);
  expect(posted?.body).toBe('Summary.\n\nThe cache is never invalidated.');
});

test('the verdict goes with the review: an approval may say nothing', async () => {
  await postPullRequestReview(db, () => api, reviewId, { summary: '', verdict: 'approve' });
  draft({ startLine: 3, body: 'Rename this.' });
  await postPullRequestReview(db, () => api, reviewId, { summary: '', verdict: 'request_changes' });

  expect(
    api.reviews.map((posted) => [posted.verdict, posted.body, posted.comments.length]),
  ).toEqual([
    ['approve', '', 0],
    ['request_changes', '', 1],
  ]);
});

test('a failure keeps the drafts and the error on the review', async () => {
  draft({ startLine: 3, body: 'Rename this.' });
  const failing = {
    createPullRequestReview: () => Promise.reject(new Error('Validation Failed: line not in diff')),
  } as unknown as GitHubApi;

  await postPullRequestReview(db, () => failing, reviewId, { summary: '', verdict: 'comment' });

  expect(statuses()).toEqual(['draft']);
  expect(review()).toMatchObject({
    submitStatus: 'failed',
    submitError: 'Validation Failed: line not in diff',
  });
});

test('a comment added while the review is posted stays a draft', async () => {
  draft({ startLine: 3, body: 'First.' });
  const slow = {
    createPullRequestReview: (): Promise<string> => {
      draft({ startLine: 4, body: 'Added meanwhile.' });
      return Promise.resolve('https://github.test/review');
    },
  } as unknown as GitHubApi;

  await postPullRequestReview(db, () => slow, reviewId, { summary: '', verdict: 'comment' });

  const rows = db.select().from(schema.reviewComments).all();
  expect(rows.map((row) => [row.body, row.status])).toEqual([
    ['First.', 'sent'],
    ['Added meanwhile.', 'draft'],
  ]);
  expect(review()?.submitStatus).toBeNull();
});

test('the posted review is logged with its verdict, on the ticket whose pull request it is', async () => {
  const project = db.select().from(schema.projects).get();
  const ticket = project ? createTicket(db, { projectId: project.id, title: 'Search' }) : null;
  if (!ticket) {
    throw new Error('no project');
  }
  db.update(schema.tickets).set({ prNumber: 42 }).where(eq(schema.tickets.id, ticket.id)).run();
  await postPullRequestReview(db, () => api, reviewId, { summary: '', verdict: 'approve' });
  const [posted] = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.type, 'pr_review_posted'))
    .all();
  expect(posted).toMatchObject({
    ticketId: ticket.id,
    payload: { number: 42, verdict: 'approve' },
  });
});
