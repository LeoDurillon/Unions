import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';

let db: Db;
let app: Hono;
let ticketId: number;

function remove(id: number): Response | Promise<Response> {
  return app.request(`/api/tickets/${id}`, { method: 'DELETE' });
}

function setTicket(values: Partial<typeof schema.tickets.$inferInsert>): void {
  db.update(schema.tickets).set(values).where(eq(schema.tickets.id, ticketId)).run();
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
  ticketId = createTicket(db, { projectId, title: 'Old idea', body: '' }).id;
});

test('only a cancelled ticket can be removed, once its agent has stopped', async () => {
  expect((await remove(ticketId)).status).toBe(409);
  setTicket({ phase: { kind: 'cancelled' } });
  const run = db
    .insert(schema.runs)
    .values({ ticketId, step: 'intake', model: 'opus', status: 'running' })
    .returning()
    .get();
  expect((await remove(ticketId)).status).toBe(409);
  db.update(schema.runs).set({ status: 'failed' }).where(eq(schema.runs.id, run.id)).run();
  expect((await remove(ticketId)).status).toBe(204);
  expect(db.select().from(schema.tickets).all()).toHaveLength(0);
  expect(db.select().from(schema.runs).all()).toHaveLength(0);
  expect((await remove(ticketId)).status).toBe(404);
});

test('its container is handed to the worker, and its pending commands are dropped', async () => {
  setTicket({
    phase: { kind: 'cancelled' },
    containerName: 'union-t1',
    homeVolume: 'union-t1-home',
    workspaceVolume: 'union-t1-ws',
  });
  db.insert(schema.commands).values({ ticketId, type: 'retry' }).run();
  expect((await remove(ticketId)).status).toBe(204);
  const commands = db.select().from(schema.commands).all();
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({
    ticketId: null,
    type: 'remove_containers',
    payload: {
      containers: [{ name: 'union-t1', home: 'union-t1-home', workspace: 'union-t1-ws' }],
    },
  });
});
