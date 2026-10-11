import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  DEFAULT_PROMPTS,
  migrateDb,
  resolveAgent,
  type AgentConfig,
  type Db,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';

let db: Db;
let app: Hono;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
});

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('lists the shared prompt and every step agent with their defaults', async () => {
  const agents = (await (await send('GET', '/api/agents')).json()) as AgentConfig[];
  expect(agents.map((agent) => [agent.agent, agent.model, agent.customized])).toEqual([
    ['shared', null, false],
    ['intake', 'haiku', false],
    ['summary', 'sonnet', false],
    ['technical', 'opus', false],
    ['test_plan', 'sonnet', false],
    ['implement', 'opus', false],
    ['final_review', 'opus', false],
    ['rebase', null, false],
  ]);
});

test('saves an edited prompt and model, then resets to the default', async () => {
  const saved = await send('PUT', '/api/agents/technical', {
    prompt: 'Be brief.',
    model: 'sonnet',
  });
  expect(saved.status).toBe(200);
  expect(resolveAgent(db, 'technical')).toMatchObject({
    prompt: 'Be brief.',
    model: 'sonnet',
    customized: true,
  });
  const reset = (await (await send('DELETE', '/api/agents/technical')).json()) as AgentConfig;
  expect(reset).toMatchObject({
    prompt: DEFAULT_PROMPTS.technical,
    model: 'opus',
    customized: false,
  });
});

test('rejects unknown agents, empty prompts and invalid models; shared needs no model', async () => {
  expect((await send('PUT', '/api/agents/nope', { prompt: 'x', model: 'opus' })).status).toBe(404);
  expect((await send('PUT', '/api/agents/intake', { prompt: '  ', model: 'opus' })).status).toBe(
    400,
  );
  expect((await send('PUT', '/api/agents/intake', { prompt: 'x' })).status).toBe(400);
  expect(
    (await send('PUT', '/api/agents/intake', { prompt: 'x', model: 'opus; rm -rf' })).status,
  ).toBe(400);
  expect((await send('PUT', '/api/agents/shared', { prompt: 'House rules.' })).status).toBe(200);
  expect((await send('PUT', '/api/agents/rebase', { prompt: 'Prefer ours.' })).status).toBe(200);
  expect(resolveAgent(db, 'shared')).toMatchObject({ prompt: 'House rules.', model: null });
});
