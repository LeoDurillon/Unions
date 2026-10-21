import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, updatePreview, type Db } from '@union/core';
import type { Hono } from 'hono';

import type { CurrentReview } from './api-types';
import { createApp } from './app';

let db: Db;
let app: Hono;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

function send(method: string, path: string, body?: unknown): Promise<Response> | Response {
  return app.request(`/api/projects/${projectId}/pull-requests/reviews${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const pull = (number: number): Record<string, unknown> => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/acme/shop/pull/${number}`,
  author: 'alice',
  headBranch: `branch-${number}`,
  baseBranch: 'main',
});

test('pull requests are added once, listed newest first, and removed', async () => {
  expect((await send('POST', '', pull(7))).status).toBe(201);
  expect((await send('POST', '', pull(9))).status).toBe(201);
  expect((await send('POST', '', pull(7))).status).toBe(409);

  const list = (await (await send('GET', '')).json()) as CurrentReview[];
  expect(list.map((review) => [review.prNumber, review.title])).toEqual([
    [9, 'PR 9'],
    [7, 'PR 7'],
  ]);

  expect((await send('DELETE', '/7')).status).toBe(200);
  expect((await send('DELETE', '/7')).status).toBe(404);
  const after = (await (await send('GET', '')).json()) as CurrentReview[];
  expect(after.map((review) => review.prNumber)).toEqual([9]);
});

test('each project has its own reviews; bad input and unknown projects are refused', async () => {
  await send('POST', '', pull(7));
  const other = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'blog', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const response = await app.request(`/api/projects/${other.id}/pull-requests/reviews`);
  expect(await response.json()).toEqual([]);

  expect((await send('POST', '', { ...pull(8), title: ' ' })).status).toBe(400);
  expect((await send('POST', '', { ...pull(8), number: 'x' })).status).toBe(400);
  expect((await app.request('/api/projects/999/pull-requests/reviews')).status).toBe(404);
});

test('a stack is added at once; those already under review are skipped', async () => {
  await send('POST', '', pull(12));
  const response = await send('POST', '/stack', { pullRequests: [pull(12), pull(13), pull(14)] });
  expect(response.status).toBe(201);
  const added = (await response.json()) as CurrentReview[];
  expect(added.map((review) => review.prNumber)).toEqual([13, 14]);
  const again = (await (await send('POST', '/stack', { pullRequests: [pull(13)] })).json()) as [];
  expect(again).toEqual([]);
});

test('each keeps the GitHub stack it was listed in, and its place there', async () => {
  await send('POST', '/stack', {
    pullRequests: [
      { ...pull(12), stack: { number: 3, position: 0 } },
      { ...pull(13), stack: { number: 3, position: 1 } },
    ],
  });
  await send('POST', '', { ...pull(20), stack: { number: 'x' } });
  const list = (await (await send('GET', '')).json()) as CurrentReview[];
  expect(
    list.map((review) => [review.prNumber, review.githubStackNumber, review.stackPosition]),
  ).toEqual([
    [20, null, null],
    [13, 3, 1],
    [12, 3, 0],
  ]);
});

test('a stack with one bad pull request adds nothing', async () => {
  const bad = await send('POST', '/stack', { pullRequests: [pull(20), { ...pull(21), url: '' }] });
  expect(bad.status).toBe(400);
  expect((await send('POST', '/stack', { pullRequests: [] })).status).toBe(400);
  expect((await send('POST', '/stack', { pullRequests: ['x'] })).status).toBe(400);
  expect(await (await send('GET', '')).json()).toEqual([]);
});

test('a stack is removed whole, or not at all when one of it is not under review', async () => {
  await send('POST', '/stack', { pullRequests: [pull(12), pull(13), pull(14)] });
  expect((await send('POST', '/stack/remove', { numbers: [12, 13, 99] })).status).toBe(404);
  const kept = (await (await send('GET', '')).json()) as CurrentReview[];
  expect(kept.map((review) => review.prNumber)).toEqual([14, 13, 12]);

  const response = await send('POST', '/stack/remove', { numbers: [12, 13] });
  expect(await response.json()).toEqual({ numbers: [12, 13] });
  const after = (await (await send('GET', '')).json()) as CurrentReview[];
  expect(after.map((review) => review.prNumber)).toEqual([14]);
  expect((await send('POST', '/stack/remove', { numbers: [] })).status).toBe(400);
});

test('a pull request from a fork is marked so', async () => {
  await send('POST', '', { ...pull(7), crossRepository: true });
  await send('POST', '', pull(9));
  const list = (await (await send('GET', '')).json()) as CurrentReview[];
  expect(list.map((review) => [review.prNumber, review.fromFork])).toEqual([
    [9, false],
    [7, true],
  ]);
});

test("each review lists its preview's state", async () => {
  await send('POST', '', pull(7));
  await send('POST', '', pull(9));
  const [nine] = (await (await send('GET', '')).json()) as CurrentReview[];
  if (!nine) {
    throw new Error('no review');
  }
  updatePreview(db, { reviewId: nine.id }, { status: 'running' });
  const list = (await (await send('GET', '')).json()) as CurrentReview[];
  expect(list.map((review) => [review.prNumber, review.previewStatus])).toEqual([
    [9, 'running'],
    [7, null],
  ]);
});
