import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  queueContainerRun,
  recordDataFolders,
  recordE2e,
  schema,
  updatePreview,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { PreviewView } from './api-types';
import { createApp } from './app';

let db: Db;
let app: Hono;
let projectId: number;
let ticketId: number;

const SETTINGS = {
  composeFile: 'compose.yaml',
  services: [{ name: 'web', port: 3000, prefix: '' }],
  env: {},
};

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function put(preview: unknown): Response | Promise<Response> {
  return call('PUT', `/api/projects/${projectId}/preview`, { preview });
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Search', body: '' }).id;
});

test('a reset drops a preview there is, never during a step, a test run or a command', async () => {
  const base = `/api/tickets/${ticketId}/preview`;
  const view = async (): Promise<PreviewView> =>
    (await (await call('GET', base)).json()) as PreviewView;
  await put(SETTINGS);
  db.update(schema.tickets)
    .set({ workspaceVolume: 'union-t1-ws' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await view()).resetRefusal).toContain('no preview to reset');
  // The agent's services hold containers without a preview.
  await put({ ...SETTINGS, agentServices: ['db'] });
  expect((await view()).resetRefusal).toBeNull();
  updatePreview(db, { ticketId }, { status: 'stopped' });

  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await view()).resetRefusal).toContain('step is running');
  expect((await call('POST', `${base}/reset`, {})).status).toBe(409);
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();

  recordE2e(db, { ticketId }, { e2eStatus: 'running' });
  expect((await view()).resetRefusal).toContain('end-to-end tests are running');
  recordE2e(db, { ticketId }, { e2eStatus: 'green' });
  const run = queueContainerRun(db, { owner: { ticketId }, command: 'npm run seed' });
  expect((await view()).resetRefusal).toContain('command is running');
  db.delete(schema.containerRuns).where(eq(schema.containerRuns.id, run.id)).run();

  expect((await call('POST', `${base}/reset`, {})).status).toBe(202);
  expect((await call('POST', `${base}/reset`, {})).status).toBe(409);
  expect(db.select().from(schema.commands).all()).toMatchObject([
    { type: 'preview_reset', ticketId },
  ]);
});

test('a reset carries the data folders chosen, only ones the last start found', async () => {
  const base = `/api/tickets/${ticketId}/preview`;
  await put(SETTINGS);
  db.update(schema.tickets)
    .set({ workspaceVolume: 'union-t1-ws' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  updatePreview(db, { ticketId }, { status: 'stopped' });
  recordDataFolders(db, { ticketId }, ['data']);
  const view = (await (await call('GET', base)).json()) as PreviewView;
  expect(view.preview?.dataFolders).toEqual(['data']);
  const unknown = await call('POST', `${base}/reset`, { folders: ['src'] });
  expect(unknown.status).toBe(400);
  expect(await unknown.text()).toContain('Not a data folder of the preview: src');
  expect((await call('POST', `${base}/reset`, { folders: 'data' })).status).toBe(400);
  expect((await call('POST', `${base}/reset`, { folders: ['data', 'data'] })).status).toBe(202);
  expect(db.select().from(schema.commands).all()).toMatchObject([
    { type: 'preview_reset', ticketId, payload: { folders: ['data'] } },
  ]);
});
