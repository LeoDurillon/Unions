import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  dispatch,
  migrateDb,
  saveOutput,
  schema,
  type Db,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';

let db: Db;
let app: Hono;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  projectId = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r',
      githubProjectNodeId: 'P',
      githubToken: 'old',
      config: { baseBranch: 'main' },
    })
    .returning()
    .get().id;
});

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function stored(): typeof schema.projects.$inferSelect | undefined {
  return db.select().from(schema.projects).get();
}

test('patch replaces the token and branch independently, never returning the token', async () => {
  const response = await send('PATCH', `/api/projects/${projectId}`, { token: 'ghp_new' });
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain('ghp_new');
  expect(stored()).toMatchObject({ githubToken: 'ghp_new', config: { baseBranch: 'main' } });

  await send('PATCH', `/api/projects/${projectId}`, { baseBranch: 'develop' });
  expect(stored()).toMatchObject({ githubToken: 'ghp_new', config: { baseBranch: 'develop' } });

  expect((await send('PATCH', `/api/projects/${projectId}`, {})).status).toBe(400);
  expect((await send('PATCH', '/api/projects/99', { token: 'x' })).status).toBe(404);
});

test('checks: set, change and clear the commands; the iteration limit is validated', async () => {
  const set = await send('PATCH', `/api/projects/${projectId}`, {
    installCommand: 'bun install',
    gateCommand: 'bun run check',
    maxIterations: 4,
  });
  expect(set.status).toBe(200);
  expect(stored()?.config).toEqual({
    baseBranch: 'main',
    installCommand: 'bun install',
    gateCommand: 'bun run check',
    maxIterations: 4,
  });
  await send('PATCH', `/api/projects/${projectId}`, { installCommand: '' });
  expect(stored()?.config).toMatchObject({ gateCommand: 'bun run check', maxIterations: 4 });
  expect(stored()?.config.installCommand).toBeUndefined();
  expect((await send('PATCH', `/api/projects/${projectId}`, { maxIterations: 0 })).status).toBe(
    400,
  );
  expect((await send('PATCH', `/api/projects/${projectId}`, { maxIterations: 11 })).status).toBe(
    400,
  );
  expect((await send('PATCH', `/api/projects/${projectId}`, { gateCommand: 3 })).status).toBe(400);
});

test('the automatic pull request can be turned off and on; only booleans are accepted', async () => {
  await send('PATCH', `/api/projects/${projectId}`, { createPullRequest: false });
  expect(stored()?.config.createPullRequest).toBe(false);
  expect(
    (await send('PATCH', `/api/projects/${projectId}`, { createPullRequest: 'no' })).status,
  ).toBe(400);
  await send('PATCH', `/api/projects/${projectId}`, { createPullRequest: true });
  expect(stored()?.config.createPullRequest).toBe(true);
});

test('review ignore rules: patterns are trimmed and validated; lock files can be shown again', async () => {
  await send('PATCH', `/api/projects/${projectId}`, {
    reviewIgnore: [' dist/ ', '', '*.snap'],
    hideLockFiles: false,
  });
  expect(stored()?.config).toMatchObject({
    reviewIgnore: ['dist/', '*.snap'],
    hideLockFiles: false,
  });
  expect(
    (await send('PATCH', `/api/projects/${projectId}`, { reviewIgnore: 'dist/' })).status,
  ).toBe(400);
  expect((await send('PATCH', `/api/projects/${projectId}`, { reviewIgnore: [3] })).status).toBe(
    400,
  );
  expect((await send('PATCH', `/api/projects/${projectId}`, { hideLockFiles: 'yes' })).status).toBe(
    400,
  );
});

test('delete removes the project and its tickets and queues container cleanup', async () => {
  const ticket = createTicket(db, { projectId, title: 't' });
  dispatch(db, ticket.id, { type: 'start' });
  saveOutput(db, ticket.id, 'intake', 'out');
  dispatch(db, ticket.id, { type: 'run_finished' });
  db.update(schema.tickets)
    .set({ containerName: 'union-t1', homeVolume: 'union-t1-home', workspaceVolume: 'union-t1-ws' })
    .run();
  db.insert(schema.commands).values({ type: 'approve', ticketId: ticket.id }).run();

  expect((await send('DELETE', `/api/projects/${projectId}`)).status).toBe(204);
  expect(stored()).toBeUndefined();
  expect(db.select().from(schema.tickets).all()).toEqual([]);
  expect(db.select().from(schema.stepOutputs).all()).toEqual([]);
  expect(db.select().from(schema.commands).all()).toMatchObject([
    {
      type: 'remove_containers',
      payload: {
        containers: [{ name: 'union-t1', home: 'union-t1-home', workspace: 'union-t1-ws' }],
      },
    },
  ]);
});

test('delete is refused while an agent runs on one of the tickets', async () => {
  const ticket = createTicket(db, { projectId, title: 't' });
  dispatch(db, ticket.id, { type: 'start' });
  expect((await send('DELETE', `/api/projects/${projectId}`)).status).toBe(409);
  expect(stored()).toBeDefined();
});
