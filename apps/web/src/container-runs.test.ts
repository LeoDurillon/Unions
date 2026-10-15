import { beforeEach, expect, test } from 'bun:test';

import {
  claimContainerRun,
  createDb,
  createTicket,
  finishContainerRun,
  migrateDb,
  schema,
  type Db,
} from '@union/core';
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

async function finishedRun(): Promise<number> {
  const { runs } = (await (await post('', { command: 'npm test' })).json()) as ContainerRunsView;
  const id = runs[0]?.id ?? 0;
  claimContainerRun(db);
  finishContainerRun(db, id, { status: 'failed', exitCode: 1, error: null, output: 'FAIL' });
  return id;
}

test('an output is kept for the next run; sending it now needs a ticket the implementer can take back', async () => {
  const id = await finishedRun();
  const kept = (await (await post(`/${id}/keep`, { keep: true })).json()) as ContainerRunsView;
  expect(kept.runs[0]?.forAgent).toBe('next_run');
  expect(kept.canSend).toBe(false);
  expect((await post(`/${id}/keep`, { keep: 'yes' })).status).toBe(400);
  expect((await post(`/${id}/send`, { note: 'fix it' })).status).toBe(409);
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await post(`/${id}/send`, {})).status).toBe(202);
  const [revise] = db.select().from(schema.commands).all();
  expect(revise?.type).toBe('revise');
  expect(JSON.stringify(revise?.payload)).toContain('output of the command');
  // The revision is still waiting for the worker: nothing else is queued meanwhile.
  expect((await post(`/${id}/send`, { note: 'again' })).status).toBe(409);
});

test('a saved script runs by name, with its command and timeout', async () => {
  db.update(schema.projects)
    .set({
      config: {
        baseBranch: 'main',
        scripts: [{ name: 'Import', command: 'npm run import', timeoutSec: 900 }],
      },
    })
    .run();
  expect((await post('', { scriptName: 'Missing' })).status).toBe(409);
  const created = await post('', { scriptName: 'Import' });
  expect(created.status).toBe(201);
  const { runs } = (await created.json()) as ContainerRunsView;
  expect(runs).toMatchObject([
    { command: 'npm run import', scriptName: 'Import', timeoutSec: 900, status: 'queued' },
  ]);
});
