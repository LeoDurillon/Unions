import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  migrateDb,
  NotionError,
  saveNotionConnection,
  schema,
  type Db,
  type NotionApi,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const UNSHARED = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const urlOf = (id: string): string => `https://www.notion.so/${id.replaceAll('-', '')}`;

const notion = {
  page: (_token: string, id: string) =>
    id === UNSHARED
      ? Promise.reject(new NotionError('Could not find page', 404))
      : Promise.resolve({ id, title: 'Export to CSV', url: urlOf(id), dataSourceId: null }),
} as unknown as NotionApi;

let db: Db;
let app: Hono;
let projectId: number;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, notion);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' }, githubToken: 'ghp_x' })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: null });
  ticketId = createTicket(db, { projectId, title: 'Export', body: 'As written' }).id;
});

function send(method: string, path: string, body?: unknown): Promise<Response> | Response {
  return app.request(`/api/tickets/${ticketId}/notion${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function origin(): unknown {
  const { originKind, originId, originUrl, body } = getTicket(db, ticketId);
  return { originKind, originId, originUrl, body };
}

const UNLINKED = { originKind: null, originId: null, originUrl: null, body: 'As written' };

test('a page is checked, linked by URL with the description kept, changed and unlinked', async () => {
  const checked = await send('POST', '/check', { page: urlOf(PAGE) });
  expect(await checked.json()).toEqual({ pageId: PAGE, title: 'Export to CSV', url: urlOf(PAGE) });
  expect(origin()).toEqual(UNLINKED);

  expect((await send('PUT', '', { page: urlOf(PAGE) })).status).toBe(200);
  expect(origin()).toEqual({
    ...UNLINKED,
    originKind: 'notion',
    originId: PAGE,
    originUrl: urlOf(PAGE),
  });

  expect((await send('PUT', '', { page: OTHER })).status).toBe(200);
  expect(origin()).toEqual({
    ...UNLINKED,
    originKind: 'notion',
    originId: OTHER,
    originUrl: urlOf(OTHER),
  });

  expect((await send('DELETE', '')).status).toBe(200);
  expect(origin()).toEqual(UNLINKED);
});

test('an unshared page, a bad URL, a missing ticket and a project without Notion are refused', async () => {
  expect((await send('PUT', '', { page: urlOf(UNSHARED) })).status).toBe(404);
  expect((await send('PUT', '', { page: 'not a page' })).status).toBe(400);
  expect(origin()).toEqual(UNLINKED);

  const missing = await app.request('/api/tickets/999/notion', { method: 'DELETE' });
  expect(missing.status).toBe(404);

  saveNotionConnection(db, projectId, { token: null, dataSourceId: null });
  expect((await send('PUT', '', { page: urlOf(PAGE) })).status).toBe(409);
});
