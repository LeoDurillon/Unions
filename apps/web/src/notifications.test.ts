import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { NotificationPage } from './routes/notifications';

let db: Db;
let app: Hono;
let ticketId: number;
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
  ticketId = createTicket(db, { projectId, title: 'Search page' }).id;
});

function notify(eventSeq: number): number {
  return db
    .insert(schema.notifications)
    .values({
      projectId,
      ticketId,
      kind: 'awaiting_approval',
      title: 'Search page',
      detail: 'Summary waits for your approval.',
      eventSeq,
    })
    .returning()
    .get().id;
}

async function page(query = ''): Promise<NotificationPage> {
  const response = await app.request(`/api/notifications${query}`);
  expect(response.status).toBe(200);
  return (await response.json()) as NotificationPage;
}

function post(path: string): Promise<Response> | Response {
  return app.request(`/api/notifications${path}`, { method: 'POST' });
}

test('notifications are listed newest first, a page at a time, with the unread count', async () => {
  const [a, b, c] = [notify(1), notify(2), notify(3)];
  const first = await page('?limit=2');
  expect(first.items.map((item) => item.id)).toEqual([c, b]);
  expect(first.unread).toBe(3);
  const next = await page(`?limit=2&before=${b}`);
  expect(next.items.map((item) => item.id)).toEqual([a]);
});

test('one is marked read, then all; marking again keeps the first time', async () => {
  const [a, b] = [notify(1), notify(2)];
  expect((await post(`/${a}/read`)).status).toBe(200);
  const read = (await page()).items.find((item) => item.id === a)?.readAt;
  expect(read).toBeNumber();
  expect((await page()).unread).toBe(1);

  const response = await post('/read-all');
  expect(await response.json()).toEqual({ marked: 1 });
  const after = await page();
  expect(after.unread).toBe(0);
  expect(after.items.find((item) => item.id === a)?.readAt).toBe(read ?? -1);
  expect(after.items.find((item) => item.id === b)?.readAt).toBeNumber();
});

test('unknown or malformed ids are refused', async () => {
  expect((await post('/999/read')).status).toBe(404);
  expect((await post('/abc/read')).status).toBe(400);
  expect((await app.request('/api/notifications?before=x')).status).toBe(400);
});
