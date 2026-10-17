import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, updatePreview, type Db } from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { RunningPreview } from './running-previews-types';

let db: Db;
let app: Hono;
let ticketId: number;
let reviewId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Search' }).id;
  const stopped = createTicket(db, { projectId, title: 'Old' }).id;
  reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'PR 7',
      url: 'u',
      author: 'alice',
      headBranch: 'feature',
      baseBranch: 'main',
    })
    .returning()
    .get().id;
  updatePreview(db, { ticketId }, { status: 'running', url: 'http://1.localhost:8080' });
  updatePreview(db, { reviewId }, { status: 'starting' });
  updatePreview(db, { ticketId: stopped }, { status: 'stopped' });
});

function stop(id: number): Promise<Response> | Response {
  return app.request(`/api/previews/${id}/stop`, { method: 'POST' });
}

async function list(): Promise<RunningPreview[]> {
  return (await (await app.request('/api/previews')).json()) as RunningPreview[];
}

test("every project's previews holding containers are listed, a ticket's and a pull request's", async () => {
  const shown = await list();
  expect(
    shown.map(({ owner, status, project, stopRefusal }) => [
      owner,
      status,
      project.repo,
      stopRefusal,
    ]),
  ).toEqual([
    [{ kind: 'ticket', ticketId, title: 'Search' }, 'running', 'shop', null],
    [
      { kind: 'pull-request', reviewId, number: 7, title: 'PR 7', url: 'u' },
      'starting',
      'shop',
      'It is not running.',
    ],
  ]);
});

test('Stop queues the worker command for its owner, once', async () => {
  const [ticketPreview, reviewPreview] = await list();
  if (!ticketPreview || !reviewPreview) {
    throw new Error('missing previews');
  }
  expect((await stop(ticketPreview.id)).status).toBe(202);
  expect(db.select().from(schema.commands).all()).toMatchObject([
    { type: 'preview_stop', ticketId },
  ]);
  expect((await stop(ticketPreview.id)).status).toBe(409);
  expect((await stop(reviewPreview.id)).status).toBe(409);
  expect((await stop(999)).status).toBe(404);
  updatePreview(db, { reviewId }, { status: 'running' });
  expect((await stop(reviewPreview.id)).status).toBe(202);
  expect(db.select().from(schema.commands).all().at(-1)).toMatchObject({
    type: 'preview_stop',
    ticketId: null,
    payload: { reviewId },
  });
  expect((await list())[0]?.stopRefusal).toBe('There is no preview to stop.');
});
