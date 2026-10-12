import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import type { CommentView, CurrentReview, DiffResponse, DiscussionResponse } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';
import { toPullRequestFile } from './github-pull-request-files';

const PATCH = `@@ -1,3 +1,4 @@
 export function add(a, b) {
-  return a+b;
+  return a + b;
 }
+export const zero = 0;`;

let db: Db;
let app: Hono;
let projectId: number;
let head: string;

const github = {
  getDiscussion: () =>
    Promise.resolve({
      description: 'Tidies the math helpers.',
      threads: [],
      notes: [
        {
          kind: 'comment',
          author: 'bob',
          bot: false,
          body: 'Ship it.',
          url: 'https://github.com/acme/shop/pull/42#issuecomment-1',
          state: null,
          createdAt: '2026-10-01T10:00:00Z',
        },
      ],
    }),
  getPullRequestFiles: () =>
    Promise.resolve({
      headSha: head,
      baseBranch: 'main',
      files: [
        toPullRequestFile(
          { filename: 'math.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
          0,
        ),
        toPullRequestFile({ filename: 'logo.png', status: 'added', additions: 0, deletions: 0 }, 1),
      ],
    }),
} as unknown as OnboardingGitHub;

beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github);
  head = 'h1';
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'tok', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  await send('POST', '', {
    number: 42,
    title: 'Tidy math',
    url: 'https://github.com/acme/shop/pull/42',
    author: 'alice',
    headBranch: 'tidy',
    baseBranch: 'main',
  });
});

function send(method: string, path: string, body?: unknown): Promise<Response> | Response {
  return app.request(`/api/projects/${projectId}/pull-requests/reviews${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('the diff comes from GitHub, file by file, and the list stays light', async () => {
  const diff = (await (await send('GET', '/42/diff')).json()) as DiffResponse;
  expect(diff.snapshot?.headSha).toBe('h1');
  expect(diff.files.map((file) => [file.id, file.path, file.status, file.binary])).toEqual([
    [1, 'math.js', 'modified', false],
    [2, 'logo.png', 'added', true],
  ]);
  const file = (await (await send('GET', '/42/diff/files/1')).json()) as { patch: string };
  expect(file.patch).toBe(PATCH);
  const [listed] = (await (await send('GET', '')).json()) as CurrentReview[];
  expect(listed).not.toHaveProperty('files');
  expect(listed).toMatchObject({ prNumber: 42, headSha: 'h1' });
});

test('comments are checked against the fetched lines and go out of date when the PR moves', async () => {
  expect(
    (await send('POST', '/42/comments', { path: 'math.js', startLine: 2, body: 'x' })).status,
  ).toBe(400);
  await send('GET', '/42/diff');
  const added = await send('POST', '/42/comments', {
    path: 'math.js',
    side: 'new',
    startLine: 2,
    body: 'Nice.',
  });
  expect(added.status).toBe(201);
  const comment = (await added.json()) as CommentView;
  expect(comment).toMatchObject({ excerpt: '  return a + b;', ticketId: null });
  expect(comment.reviewId).toBeNumber();
  expect(
    (await send('POST', '/42/comments', { path: 'math.js', startLine: 30, body: 'x' })).status,
  ).toBe(400);

  head = 'h2';
  await send('GET', '/42/diff');
  const [listed] = (await (await send('GET', '/42/comments')).json()) as CommentView[];
  expect(listed).toMatchObject({ body: 'Nice.', outdated: true });
});

test('submitting queues one command for the worker and refuses a second while it posts', async () => {
  expect((await send('POST', '/42/review', {})).status).toBe(400);
  await send('GET', '/42/diff');
  await send('POST', '/42/comments', { path: 'math.js', startLine: 2, body: 'Nice.' });

  expect((await send('POST', '/42/review', { summary: ' LGTM ' })).status).toBe(202);
  const [command] = db.select().from(schema.commands).all();
  expect(command).toMatchObject({ type: 'submit_pr_review', payload: { summary: 'LGTM' } });
  expect(db.select().from(schema.currentReviews).get()?.submitStatus).toBe('sending');
  expect((await send('POST', '/42/review', { summary: 'again' })).status).toBe(409);
  expect((await send('GET', '/7/diff')).status).toBe(404);
});

test('the description and the discussion come from GitHub for the other tabs', async () => {
  const discussion = (await (await send('GET', '/42/discussion')).json()) as DiscussionResponse;
  expect(discussion).toMatchObject({
    description: 'Tidies the math helpers.',
    number: 42,
    url: 'https://github.com/acme/shop/pull/42',
    notes: [{ author: 'bob', body: 'Ship it.' }],
  });
  expect((await send('GET', '/7/discussion')).status).toBe(404);
});
