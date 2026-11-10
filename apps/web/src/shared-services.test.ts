// Tests for the shared services' routes: their state, who uses them, and restarting or stopping them.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  saveSharedStack,
  schema,
  updatePreview,
  type Db,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { SharedServicesView } from './shared-services-types';

let db: Db;
let app: Hono;
let projectId: number;
let ticketId: number;

function path(action = ''): string {
  return `/api/projects/${projectId}/shared-services${action}`;
}

async function read(): Promise<SharedServicesView> {
  return (await (await app.request(path())).json()) as SharedServicesView;
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
  ticketId = createTicket(db, { projectId, title: 'Scan uploads', body: '' }).id;
});

test('nothing ran yet: no state, nothing to restart', async () => {
  expect(await read()).toEqual({
    stack: null,
    previews: [],
    agents: [],
    pending: null,
    refusals: { restart: 'They are not running.', stop: null },
  });
});

test('the state names the previews and the agents that use them', async () => {
  saveSharedStack(db, projectId, {
    services: [{ service: 'clamav', running: true }],
    previews: [`t${ticketId}`],
    agents: [ticketId],
    urls: [],
    error: null,
  });
  const shown = await read();
  expect(shown.stack?.status).toBe('running');
  expect(shown.previews).toEqual([{ kind: 'ticket', ticketId, title: 'Scan uploads' }]);
  expect(shown.agents).toEqual([{ ticketId, title: 'Scan uploads' }]);
});

test('a stop waits for the previews to stop; a restart is queued once', async () => {
  saveSharedStack(db, projectId, {
    services: [{ service: 'clamav', running: true }],
    previews: [],
    agents: [],
    urls: [],
    error: null,
  });
  updatePreview(db, { ticketId }, { status: 'running' });
  expect((await app.request(path('/stop'), { method: 'POST' })).status).toBe(409);
  const restarted = await app.request(path('/restart'), { method: 'POST' });
  expect(restarted.status).toBe(202);
  expect(((await restarted.json()) as SharedServicesView).pending).toBe('restart');
  expect((await app.request(path('/restart'), { method: 'POST' })).status).toBe(409);
  const queued = db.select().from(schema.commands).all();
  expect(queued.map(({ type, payload }) => ({ type, payload }))).toEqual([
    { type: 'shared_restart', payload: { projectId } },
  ]);
});
