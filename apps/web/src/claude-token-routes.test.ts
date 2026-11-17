import { beforeEach, expect, test } from 'bun:test';

import { claudeToken, createDb, latestConnectorCheck, migrateDb, type Db } from '@union/core';

import { claudeTokenRoutes } from './routes/claude-token';

const TOKEN = `sk-ant-oat01-${'x'.repeat(40)}`;

let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

function put(token: string): Promise<Response> | Response {
  return claudeTokenRoutes(db).request('/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

test('saves a token, never sends it back, and reads the connectors again', async () => {
  const saved = await put(`  ${TOKEN}\n`);
  expect(saved.status).toBe(200);
  const body = await saved.text();
  expect(body).not.toContain('sk-ant');
  expect(JSON.parse(body)).toMatchObject({ configured: true });
  expect(claudeToken(db)).toBe(TOKEN);
  expect(latestConnectorCheck(db)?.status).toBe('queued');
  const read = await claudeTokenRoutes(db).request('/');
  expect(await read.text()).not.toContain('sk-ant');
});

test('refuses what is not a setup token, and keeps the one saved', async () => {
  await put(TOKEN);
  const refused = await put(`sk-ant-ort01-${'x'.repeat(40)}`);
  expect(refused.status).toBe(400);
  expect(claudeToken(db)).toBe(TOKEN);
});

test('removing the token goes back to the login', async () => {
  await put(TOKEN);
  const removed = await claudeTokenRoutes(db).request('/', { method: 'DELETE' });
  expect(await removed.json()).toEqual({ configured: false });
  expect(claudeToken(db)).toBeNull();
});
