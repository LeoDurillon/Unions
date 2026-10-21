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
let base: string;
let merged: number[];

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
  // #42 is `tidy` into `base`; any other is on `tidy`, as a stack on #42 would be.
  getPullRequestFiles: (_auth: unknown, _repo: unknown, number: number) =>
    Promise.resolve({
      state: merged.includes(number) ? 'merged' : 'open',
      headSha: head,
      headBranch: number === 42 ? 'tidy' : `tidy-${number}`,
      baseBranch: number === 42 ? base : 'tidy',
      files: [
        toPullRequestFile(
          { filename: 'math.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
          0,
        ),
        toPullRequestFile({ filename: 'logo.png', status: 'added', additions: 0, deletions: 0 }, 1),
      ],
    }),
  // #42 and #43 are a stack on GitHub; #50 is alone.
  pullRequestStack: (_auth: unknown, _repo: unknown, number: number) =>
    Promise.resolve(
      [42, 43].includes(number)
        ? {
            number: 1,
            open: true,
            base: 'main',
            pullRequests: [42, 43].map((pull) => ({
              number: pull,
              state: 'open',
              mergedAt: null,
              headRef: pull === 42 ? 'tidy' : `tidy-${pull}`,
              headSha: 'h1',
            })),
          }
        : null,
    ),
} as unknown as OnboardingGitHub;

beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github);
  head = 'h1';
  base = 'main';
  merged = [];
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

test('reading the files again keeps the branches GitHub has now: a retargeted PR moves base', async () => {
  base = 'develop';
  await send('GET', '/42/diff');
  const [listed] = (await (await send('GET', '')).json()) as CurrentReview[];
  expect(listed).toMatchObject({ headBranch: 'tidy', baseBranch: 'develop' });
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
  expect(command).toMatchObject({
    type: 'submit_pr_review',
    payload: { summary: 'LGTM', verdict: 'comment' },
  });
  expect(db.select().from(schema.currentReviews).get()?.submitStatus).toBe('sending');
  expect((await send('POST', '/42/review', { summary: 'again' })).status).toBe(409);
  expect((await send('GET', '/7/diff')).status).toBe(404);
});

test('an approval may be sent empty; a request for changes needs something to say', async () => {
  await send('GET', '/42/diff');
  expect((await send('POST', '/42/review', { verdict: 'merge' })).status).toBe(400);
  expect((await send('POST', '/42/review', { verdict: 'request_changes' })).status).toBe(400);

  expect((await send('POST', '/42/review', { verdict: 'approve' })).status).toBe(202);
  const [command] = db.select().from(schema.commands).all();
  expect(command?.payload).toMatchObject({ summary: '', verdict: 'approve' });
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

test('a stack is reviewed in one run: its pull requests checked, their files read again', async () => {
  await send('POST', '', {
    number: 43,
    title: 'On tidy',
    url: 'u',
    author: 'alice',
    headBranch: 'tidy-43',
    baseBranch: 'tidy',
  });
  await send('POST', '', {
    number: 50,
    title: 'Alone',
    url: 'u',
    author: 'alice',
    headBranch: 'solo',
    baseBranch: 'main',
  });
  const spec = { kind: 'pr', label: 'PR #42 description', text: 'Tidy.', prs: [42] };
  expect((await send('POST', '/43/agent-review', { specs: [], stack: [42, 43, 99] })).status).toBe(
    404,
  );
  expect((await send('POST', '/43/agent-review', { specs: [], stack: [42, 43, 50] })).status).toBe(
    400,
  );
  expect(
    (await send('POST', '/43/agent-review', { specs: [{ ...spec, prs: [7] }], stack: [42, 43] }))
      .status,
  ).toBe(400);

  // A member merged since its files were read is refused by number; nothing is queued.
  merged = [43];
  const refused = await send('POST', '/43/agent-review', { specs: [spec], stack: [42, 43] });
  expect(refused.status).toBe(409);
  expect(await refused.text()).toContain('#43 is merged');
  expect((await (await send('GET', '/43/agent-review')).json()) as unknown).toBeNull();
  merged = [];

  // Every diff is read from GitHub before the run is queued.
  const started = await send('POST', '/43/agent-review', { specs: [spec], stack: [43, 42] });
  expect(started.status).toBe(202);
  expect(await started.json()).toMatchObject({ status: 'queued', stack: [42, 43], specs: [spec] });
  const fromBottom = (await (await send('GET', '/42/agent-review')).json()) as { stack: number[] };
  expect(fromBottom.stack).toEqual([42, 43]);
  expect((await send('POST', '/42/agent-review', { specs: [] })).status).toBe(409);
  const reviews = (await (await send('GET', '')).json()) as CurrentReview[];
  expect(
    reviews
      .filter((review) => review.headSha === 'h1')
      .map((review) => [review.prNumber, review.githubStackNumber, review.stackPosition])
      .toSorted(([a], [b]) => Number(a) - Number(b)),
  ).toEqual([
    [42, 1, 0],
    [43, 1, 1],
  ]);
});
