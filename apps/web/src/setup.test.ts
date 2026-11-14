// Tests the setup agent's routes: queuing a run with the chosen model, reading the latest with its proposal, Test again.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, finishInvestigation, migrateDb, schema, type Db } from '@union/core';
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

function post(body: unknown, id = projectId, path = ''): Response | Promise<Response> {
  return app.request(`/api/projects/${id}/setup${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function latest(): Promise<unknown> {
  return (await app.request(`/api/projects/${projectId}/setup`)).json();
}

test('queues a setup run on Sonnet unless another model is chosen', async () => {
  const response = await post({});
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ kind: 'setup', model: 'sonnet', status: 'queued' });
});

test('refuses a second run, an unknown model and an unknown project', async () => {
  expect((await post({ model: 'gpt' })).status).toBe(400);
  expect((await post({ model: 42 })).status).toBe(400);
  expect((await post({}, 999)).status).toBe(404);
  expect((await post({ model: 'haiku' })).status).toBe(201);
  expect((await post({})).status).toBe(409);
});

test('reads the latest run with its proposal', async () => {
  expect(await latest()).toBeNull();
  const run = (await (await post({ model: 'opus' })).json()) as { id: number };
  finishInvestigation(db, run.id, {
    status: 'succeeded',
    result: '```json\n{"summary":"ok","checks":{"gateCommand":"bun test"}}\n```',
  });
  expect(await latest()).toMatchObject({
    investigation: { id: run.id, model: 'opus' },
    proposal: { summary: 'ok', checks: { gateCommand: 'bun test' } },
  });
});

test('Test again queues a check of the values given, checked as their settings page checks them', async () => {
  const retest = (body: unknown): Response | Promise<Response> => post(body, projectId, '/checks');
  expect((await retest({ kind: 'checks', gateCommand: 'bun test' })).status).toBe(409);
  const run = (await (await post({})).json()) as { id: number };
  finishInvestigation(db, run.id, { status: 'succeeded', result: 'No block.' });
  const queued = await retest({ kind: 'checks', installCommand: ' bun install ', gateCommand: '' });
  expect(queued.status).toBe(201);
  expect(await queued.json()).toMatchObject({
    investigationId: run.id,
    status: 'queued',
    input: { kind: 'checks', installCommand: 'bun install', gateCommand: '' },
  });
  expect((await retest({ kind: 'checks', gateCommand: '' })).status).toBe(400);
  expect((await retest({ kind: 'preview', preview: { composeFile: '../out.yaml' } })).status).toBe(
    400,
  );
  expect((await retest({ kind: 'other' })).status).toBe(400);
  const preview = await retest({
    kind: 'preview',
    preview: { composeFile: 'compose.yaml', services: [{ name: 'web', port: 3000 }], env: {} },
  });
  expect(preview.status).toBe(201);
  expect(await latest()).toMatchObject({
    checks: { checks: { status: 'queued' }, preview: { input: { kind: 'preview' } } },
  });
});
