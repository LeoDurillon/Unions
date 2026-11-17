// Tests for saving an exposed service's paths on other services' hosts in the preview settings.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import type { PublicProject } from './api-types';
import { createApp } from './app';

let db: Db;
let app: Hono;
let projectId: number;

const EDITOR = { name: 'editor', port: 3001, prefix: '' };
const VIEWER = { name: 'viewer', port: 3002, prefix: 'viewer' };

function settings(paths: unknown): Record<string, unknown> {
  return {
    composeFile: 'compose.yaml',
    services: [EDITOR, VIEWER, { name: 'api', port: 3000, prefix: 'api', paths }],
    env: {},
  };
}

function put(preview: unknown): Response | Promise<Response> {
  return app.request(`/api/projects/${projectId}/preview`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preview }),
  });
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
});

test('paths are saved normalized, and no paths keeps the service as before', async () => {
  const response = await put(
    settings([
      { host: '', path: '/api/' },
      { host: 'Viewer', path: '/api', strip: false },
    ]),
  );
  expect(response.status).toBe(200);
  const saved = ((await response.json()) as PublicProject).config.preview;
  expect(saved?.services?.[2]).toEqual({
    name: 'api',
    port: 3000,
    prefix: 'api',
    paths: [
      { host: '', path: '/api', strip: true },
      { host: 'viewer', path: '/api', strip: false },
    ],
  });
  const plain = (await (await put(settings([]))).json()) as PublicProject;
  expect(plain.config.preview?.services?.[2]).toEqual({ name: 'api', port: 3000, prefix: 'api' });
});

test('a bad path, an unknown host, its own host or a path given twice is refused', async () => {
  for (const paths of [
    [{ host: '', path: '/' }],
    [{ host: '', path: '/api/*' }],
    [{ host: 'admin', path: '/api' }],
    [{ host: 'api', path: '/x' }],
    [
      { host: '', path: '/api' },
      { host: '', path: '/api/' },
    ],
    'not a list',
  ]) {
    const response = await put(settings(paths));
    expect(response.status).toBe(400);
  }
});

test('a domain per preview is kept only when on', async () => {
  const on = (await (
    await put({ ...settings([]), domainPerPreview: true })
  ).json()) as PublicProject;
  expect(on.config.preview?.domainPerPreview).toBe(true);
  const off = (await (
    await put({ ...settings([]), domainPerPreview: false })
  ).json()) as PublicProject;
  expect(off.config.preview).not.toHaveProperty('domainPerPreview');
});
