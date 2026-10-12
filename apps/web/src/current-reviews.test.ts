import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type Db } from '@union/core';
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
