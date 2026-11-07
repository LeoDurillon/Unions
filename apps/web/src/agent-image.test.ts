import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, SYNC_AGENT_IMAGE, type Db } from '@union/core';
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
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

function url(suffix = ''): string {
  return `/api/projects/${projectId}/agent-image${suffix}`;
}

function put(body: unknown): Response | Promise<Response> {
  return app.request(url(), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function syncCommands(): number {
  return db
    .select()
    .from(schema.commands)
    .all()
    .filter((command) => command.type === SYNC_AGENT_IMAGE).length;
}

test('a project that never set one runs on the base image', async () => {
  const response = await app.request(url());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ applied: null, pending: null, status: 'idle' });
});

test('saving a Dockerfile queues its build for the worker', async () => {
  const response = await put({ kind: 'dockerfile', dockerfile: 'FROM union-agent\nRUN true' });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: 'queued',
    pending: { kind: 'dockerfile', dockerfile: 'FROM union-agent\nRUN true\n' },
  });
  expect(syncCommands()).toBe(1);
});

test('a Dockerfile from another image is refused, and nothing is queued', async () => {
  const response = await put({ kind: 'dockerfile', dockerfile: 'FROM ubuntu:24.04\n' });
  expect(response.status).toBe(400);
  expect(syncCommands()).toBe(0);
});

test('dropping the save stops its build', async () => {
  await put({ kind: 'image', ref: 'ghcr.io/o/img:1' });
  const response = await app.request(url('/pending'), { method: 'DELETE' });
  expect(await response.json()).toMatchObject({ pending: null, status: 'idle' });
  expect(syncCommands()).toBe(2);
});

test('deleting the project asks the worker to remove its images', async () => {
  await put({ kind: 'image', ref: 'ghcr.io/o/img:1' });
  const response = await app.request(`/api/projects/${projectId}`, { method: 'DELETE' });
  expect(response.status).toBe(204);
  expect(syncCommands()).toBe(2);
});

test('an unknown project is a 404', async () => {
  const response = await app.request('/api/projects/999/agent-image');
  expect(response.status).toBe(404);
});
