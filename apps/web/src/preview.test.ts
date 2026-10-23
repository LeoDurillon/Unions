import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  saveGeneratedCompose,
  schema,
  updatePreview,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { PreviewSettingsView, PreviewView, PublicProject } from './api-types';
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
  services: [
    { name: 'web', port: 3000, prefix: '' },
    { name: 'api', port: 8080, prefix: 'api' },
  ],
  env: { API_URL: '{service.api.url}' },
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
  expect(
    (await put({ ...SETTINGS, services: [{ name: 'web', port: 0, prefix: '' }] })).status,
  ).toBe(400);
  expect((await put({ ...SETTINGS, env: { 'BAD-NAME': 'x' } })).status).toBe(400);
  expect((await put({ ...SETTINGS, env: { URL: '{service.db.url}' } })).status).toBe(400);
  expect((await put({ ...SETTINGS, services: [] })).status).toBe(400);
  expect(
    (
      await put({
        ...SETTINGS,
        services: [...SETTINGS.services, { name: 'db', port: 1, prefix: '' }],
      })
    ).status,
  ).toBe(400);
  expect((await put({ ...SETTINGS, envFile: { service: 'web', path: 'relative' } })).status).toBe(
    400,
  );
  const saved = (await (await put(SETTINGS)).json()) as PublicProject;
  expect(saved.config.preview).toEqual(SETTINGS);
  const withE2e = (await (
    await put({ ...SETTINGS, e2eCommand: '  npx playwright test ' })
  ).json()) as PublicProject;
  expect(withE2e.config.preview?.e2eCommand).toBe('npx playwright test');
  const withProfiles = (await (
    await put({ ...SETTINGS, profiles: ['storage', ' storage ', 'jobs'] })
  ).json()) as PublicProject;
  expect(withProfiles.config.preview?.profiles).toEqual(['storage', 'jobs']);
  expect((await put({ ...SETTINGS, profiles: ['bad profile'] })).status).toBe(400);
  const withAgent = (await (
    await put({ ...SETTINGS, agentServices: ['db', 'db', 'redis'] })
  ).json()) as PublicProject;
  expect(withAgent.config.preview?.agentServices).toEqual(['db', 'redis']);
  expect((await put({ ...SETTINGS, agentServices: ['not a service'] })).status).toBe(400);
  const chosen = { mode: 'chosen', names: ['API_URL', 'API_URL'] };
  const withVariables = (await (
    await put({ ...SETTINGS, agentVariables: chosen })
  ).json()) as PublicProject;
  expect(withVariables.config.preview?.agentVariables).toEqual({
    mode: 'chosen',
    names: ['API_URL'],
  });
  const none = (await (
    await put({ ...SETTINGS, agentVariables: { mode: 'none' } })
  ).json()) as PublicProject;
  expect(none.config.preview?.agentVariables).toEqual({ mode: 'none' });
  const all = (await (
    await put({ ...SETTINGS, agentVariables: { mode: 'all' } })
  ).json()) as PublicProject;
  expect(all.config.preview?.agentVariables).toBeUndefined();
  const unknownName = { mode: 'chosen', names: ['SECRET_KEY'] };
  expect((await put({ ...SETTINGS, agentVariables: unknownName })).status).toBe(400);
  expect((await put({ ...SETTINGS, agentVariables: { mode: 'some' } })).status).toBe(400);
  const off = (await (await put({ ...SETTINGS, forwardPorts: false })).json()) as PublicProject;
  expect(off.config.preview?.forwardPorts).toBe(false);
  const on = (await (await put({ ...SETTINGS, forwardPorts: true })).json()) as PublicProject;
  expect(on.config.preview?.forwardPorts).toBeUndefined();
  expect((await put({ ...SETTINGS, forwardPorts: 'no' })).status).toBe(400);
  const cleared = (await (await put(null)).json()) as PublicProject;
  expect(cleared.config.preview).toBeUndefined();
  expect(cleared.config.baseBranch).toBe('main');
});

test('starting the preview for implementation steps is kept only when on', async () => {
  const on = (await (
    await put({ ...SETTINGS, startForImplementation: true })
  ).json()) as PublicProject;
  expect(on.config.preview?.startForImplementation).toBe(true);
  const off = (await (
    await put({ ...SETTINGS, startForImplementation: false })
  ).json()) as PublicProject;
  expect(off.config.preview?.startForImplementation).toBeUndefined();
  expect((await put({ ...SETTINGS, startForImplementation: 'yes' })).status).toBe(400);
});

test('compose additions are saved when they are a compose file, refused otherwise', async () => {
  const saved = await put({
    ...SETTINGS,
    composeAdditions: 'services:\n  seed:\n    image: postgres  \n\n',
  });
  expect(saved.status).toBe(200);
  const project = db.select().from(schema.projects).get();
  expect(project?.config.preview?.composeAdditions).toBe(
    'services:\n  seed:\n    image: postgres\n',
  );
  expect((await put({ ...SETTINGS, composeAdditions: 'services: [unclosed' })).status).toBe(400);
  expect((await put({ ...SETTINGS, composeAdditions: '- a list' })).status).toBe(400);
  await put({ ...SETTINGS, composeAdditions: '   ' });
  expect(db.select().from(schema.projects).get()?.config.preview?.composeAdditions).toBeUndefined();
});

test('the idle time and the project cap are whole numbers in range, or left unset', async () => {
  expect((await put({ ...SETTINGS, idleStopMinutes: 0, maxRunning: 2 })).status).toBe(200);
  expect(db.select().from(schema.projects).get()?.config.preview).toMatchObject({
    idleStopMinutes: 0,
    maxRunning: 2,
  });
  expect((await put({ ...SETTINGS, idleStopMinutes: -5 })).status).toBe(400);
  expect((await put({ ...SETTINGS, maxRunning: 1.5 })).status).toBe(400);
  expect((await put({ ...SETTINGS, maxRunning: 0 })).status).toBe(400);
  await put(SETTINGS);
  expect(db.select().from(schema.projects).get()?.config.preview?.idleStopMinutes).toBeUndefined();
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
  updatePreview(db, { ticketId }, { status: 'running', url: 'http://t1.union.localhost:8080' });
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

test('secrets are written, listed by name only, and never clash with a plain variable', async () => {
  const base = `/api/projects/${projectId}/preview`;
  await put(SETTINGS);
  const saved = (await (
    await call('PUT', `${base}/secrets/DB_PASSWORD`, { value: 'hunter2' })
  ).json()) as PreviewSettingsView;
  expect(saved.secretNames).toEqual(['DB_PASSWORD']);
  const read = await (await call('GET', base)).text();
  expect(read).toContain('DB_PASSWORD');
  expect(read).not.toContain('hunter2');
  expect((await call('PUT', `${base}/secrets/API_URL`, { value: 'x' })).status).toBe(400);
  expect((await put({ ...SETTINGS, env: { DB_PASSWORD: 'x' } })).status).toBe(400);
  expect((await call('DELETE', `${base}/secrets/DB_PASSWORD`)).status).toBe(200);
  expect((await call('DELETE', `${base}/secrets/DB_PASSWORD`)).status).toBe(404);
});

test("the settings list the services of the project's latest generated compose file", async () => {
  const base = `/api/projects/${projectId}/preview`;
  const empty = (await (await call('GET', base)).json()) as PreviewSettingsView;
  expect(empty.composeServices).toBeNull();
  saveGeneratedCompose(db, { ticketId }, { yaml: 'services:\n  web: {}\n  db: {}\n' });
  const listed = (await (await call('GET', base)).json()) as PreviewSettingsView;
  expect(listed.composeServices).toMatchObject({ names: ['web', 'db'], profiles: [], ticketId });
  saveGeneratedCompose(
    db,
    { ticketId },
    { yaml: 'services: {}' },
    {
      profiles: ['storage'],
      services: ['web', 'db', 's3'],
    },
  );
  const catalog = (await (await call('GET', base)).json()) as PreviewSettingsView;
  expect(catalog.composeServices).toMatchObject({
    names: ['web', 'db', 's3'],
    profiles: ['storage'],
  });
});

test('the e2e tests run on request, never during a run, one request at a time', async () => {
  const base = `/api/tickets/${ticketId}/preview`;
  const view = async (): Promise<PreviewView> =>
    (await (await call('GET', base)).json()) as PreviewView;
  await put(SETTINGS);
  db.update(schema.tickets)
    .set({ workspaceVolume: 'union-t1-ws' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await view()).e2eRefusal).toContain('end-to-end command');
  await put({ ...SETTINGS, e2eCommand: 'npx playwright test' });
  expect(await view()).toMatchObject({ e2eCommand: 'npx playwright test', e2eRefusal: null });
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await call('POST', `${base}/e2e`)).status).toBe(409);
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await call('POST', `${base}/e2e`)).status).toBe(202);
  expect((await call('POST', `${base}/e2e`)).status).toBe(409);
  expect(db.select().from(schema.commands).all()).toMatchObject([
    { type: 'preview_e2e', ticketId },
  ]);
});
