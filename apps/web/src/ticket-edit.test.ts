import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';

let db: Db;
let app: Hono;
let ticketId: number;

const BASE = { title: 'Add search', body: 'Details' };

function put(body: unknown): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/text`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function queued(): (typeof schema.commands.$inferSelect)[] {
  return db.select().from(schema.commands).all();
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, ...BASE }).id;
});

test('an edit is queued for the worker, the ticket untouched until it writes it', async () => {
  const response = await put({ title: ' Add fuzzy search ', body: 'Typos too', base: BASE });
  expect(response.status).toBe(202);
  expect(queued()).toMatchObject([
    {
      type: 'edit_ticket',
      ticketId,
      payload: { title: 'Add fuzzy search', body: 'Typos too', base: BASE },
    },
  ]);
  const ticket = db.select().from(schema.tickets).get();
  expect(ticket).toMatchObject(BASE);
});

test('a second edit waits for the first one', async () => {
  await put({ title: 'One', body: '', base: BASE });
  const second = await put({ title: 'Two', body: '', base: BASE });
  expect(second.status).toBe(409);
  expect(queued()).toHaveLength(1);
});

test('an edit started from an older text is refused', async () => {
  const response = await put({ title: 'New', body: '', base: { title: 'Old', body: '' } });
  expect(response.status).toBe(409);
  expect(await response.text()).toContain('changed since you opened it');
});

test('an empty title or a missing base is refused', async () => {
  expect((await put({ title: '  ', body: '', base: BASE })).status).toBe(400);
  expect((await put({ title: 'New', body: '' })).status).toBe(400);
  expect(queued()).toHaveLength(0);
});
