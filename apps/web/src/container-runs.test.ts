import { beforeEach, expect, test } from 'bun:test';

import { claimContainerRun, createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { ContainerRunsView } from './api-types';
import { createApp } from './app';

let db: Db;
let app: Hono;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'T' }).id;
});

function post(path: string, body: unknown = {}): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/container-runs${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('a command is queued and listed; a second one waits for the first', async () => {
  const created = await post('', { command: 'npm test', timeoutSec: 120 });
  expect(created.status).toBe(201);
  const body = (await created.json()) as ContainerRunsView;
  expect(body.runs).toMatchObject([{ command: 'npm test', status: 'queued', timeoutSec: 120 }]);
  expect(body.refusal).toBeNull();
  expect((await post('', { command: 'ls' })).status).toBe(409);
  expect((await post('', { command: 42 })).status).toBe(400);
});

test('during a step nothing runs, and the view says why', async () => {
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await post('', { command: 'ls' })).status).toBe(409);
  const view = (await (
    await app.request(`/api/tickets/${ticketId}/container-runs`)
  ).json()) as ContainerRunsView;
  expect(view.refusal).toBe('A step is running in this workspace');
});

test('a cancel is handed to the worker as a command, only while the run is on', async () => {
  const { runs } = (await (await post('', { command: 'sleep 9' })).json()) as ContainerRunsView;
  const [run] = runs;
  claimContainerRun(db);
  expect((await post(`/${run?.id}/cancel`)).status).toBe(202);
  expect(db.select().from(schema.commands).all()).toMatchObject([
    { type: 'cancel_container_run', ticketId, payload: { containerRunId: run?.id } },
  ]);
  expect((await post('/999/cancel')).status).toBe(404);
});
