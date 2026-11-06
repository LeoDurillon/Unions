// Tests asking for a resync of a branch that moved on GitHub, and the actions held back until then.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';

let db: Db;
let app: Hono;
let ticketId: number;

const MOVED = { from: 'aaa', to: 'bbb', kind: 'diverged' } as const;

function post(path: string, body: unknown = {}): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function queued(): (typeof schema.commands.$inferSelect)[] {
  return db.select().from(schema.commands).all();
}

function setTicket(fields: Partial<typeof schema.tickets.$inferInsert>): void {
  db.update(schema.tickets).set(fields).where(eq(schema.tickets.id, ticketId)).run();
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
  ticketId = createTicket(db, { projectId, title: 'Add search' }).id;
  setTicket({
    phase: { kind: 'done' },
    branch: 'feature',
    prNumber: 7,
    prState: 'open',
    behindBy: 2,
    pushedSha: 'aaa',
    remoteMoved: MOVED,
  });
});

test('a moved branch queues a resync for the worker, once', async () => {
  expect((await post('/resync')).status).toBe(202);
  expect(queued()).toMatchObject([{ type: 'resync_branch', ticketId }]);
  expect((await post('/resync')).status).toBe(409);
});

test('a branch that did not move has nothing to resync', async () => {
  setTicket({ remoteMoved: null });
  const response = await post('/resync');
  expect(response.status).toBe(409);
  expect(queued()).toHaveLength(0);
});

test('no resync while a step works on the branch', async () => {
  setTicket({ phase: { kind: 'running', step: 'rebase' } });
  expect((await post('/resync')).status).toBe(409);
});

test('a rebase waits for the resync', async () => {
  const response = await post('/commands', { type: 'rebase' });
  expect(response.status).toBe(409);
  expect(await response.text()).toContain('resync');
  setTicket({ remoteMoved: null });
  expect((await post('/commands', { type: 'rebase' })).status).toBe(202);
});
