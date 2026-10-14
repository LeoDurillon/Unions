import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, updatePreview, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { PreviewView, PublicProject } from './api-types';
import { createApp } from './app';

let db: Db;
let app: Hono;
let projectId: number;
let ticketId: number;

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const SETTINGS = {
  composeFile: 'deploy/compose.yaml',
  service: 'web',
  port: 3000,
  env: { API_URL: 'http://api:8080' },
};

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

test('preview settings are checked, saved and cleared', async () => {
  expect((await put({ ...SETTINGS, composeFile: '../outside.yaml' })).status).toBe(400);
  expect((await put({ ...SETTINGS, port: 0 })).status).toBe(400);
  expect((await put({ ...SETTINGS, env: { 'BAD-NAME': 'x' } })).status).toBe(400);
  const saved = (await (await put(SETTINGS)).json()) as PublicProject;
  expect(saved.config.preview).toEqual(SETTINGS);
  const cleared = (await (await put(null)).json()) as PublicProject;
  expect(cleared.config.preview).toBeUndefined();
  expect(cleared.config.baseBranch).toBe('main');
});

test('a preview starts once configured and the ticket has a workspace, one command at a time', async () => {
  const base = `/api/tickets/${ticketId}/preview`;
  const view = async (): Promise<PreviewView> =>
    (await (await call('GET', base)).json()) as PreviewView;
  expect((await view()).refusal).toContain('project settings');
  await call('PUT', `/api/projects/${projectId}/preview`, { preview: SETTINGS });
  expect((await view()).refusal).toContain('no workspace');
  db.update(schema.tickets)
    .set({ workspaceVolume: 'union-t1-ws' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await view()).refusal).toBeNull();
  expect((await call('POST', `${base}/start`)).status).toBe(202);
  expect((await call('POST', `${base}/start`)).status).toBe(409);
  expect(db.select().from(schema.commands).all()).toMatchObject([
    { type: 'preview_start', ticketId },
  ]);
  expect((await call('POST', `${base}/logs`)).status).toBe(409);

  db.update(schema.commands).set({ handledAt: Date.now() }).run();
  updatePreview(db, ticketId, { status: 'running', url: 'http://1.localhost:8080' });
  expect((await view()).preview).toMatchObject({ status: 'running' });
  expect((await call('POST', `${base}/logs`)).status).toBe(202);
});

test("the ticket's own compose file is saved, refused when empty, and dropped", async () => {
  const base = `/api/tickets/${ticketId}/preview`;
  expect((await call('PUT', `${base}/compose`, { yaml: '  ' })).status).toBe(400);
  const saved = (await (
    await call('PUT', `${base}/compose`, { yaml: 'services: {}' })
  ).json()) as PreviewView;
  expect(saved.preview).toMatchObject({ status: 'stopped', override: 'services: {}' });
  const dropped = (await (
    await call('PUT', `${base}/compose`, { yaml: null })
  ).json()) as PreviewView;
  expect(dropped.preview).toMatchObject({ override: null, overrideAt: null });
});
