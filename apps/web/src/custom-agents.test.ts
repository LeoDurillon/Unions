import { beforeEach, expect, test } from 'bun:test';

import {
  claimCustomAgentPrompt,
  createDb,
  finishCustomAgentPrompt,
  migrateDb,
  schema,
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

async function created(name: string): Promise<AgentConfig> {
  const response = await send('POST', '/api/agents/custom', { name, role: 'Check for risks' });
  expect(response.status).toBe(201);
  return (await response.json()) as AgentConfig;
}

function writePrompt(id: number): void {
  claimCustomAgentPrompt(db);
  finishCustomAgentPrompt(db, id, { prompt: 'Check security.' });
}

test('a created agent is listed, queued for its prompt, and saved like a built-in one', async () => {
  const agent = await created('Security');
  expect(agent).toMatchObject({
    agent: 'agent_1',
    model: 'sonnet',
    prompt: '',
    custom: { id: 1, name: 'Security', role: 'Check for risks', promptStatus: 'queued' },
  });
  const agents = (await (await send('GET', '/api/agents')).json()) as AgentConfig[];
  expect(agents.at(-1)?.agent).toBe('agent_1');
  writePrompt(1);
  const saved = await send('PUT', '/api/agents/agent_1', {
    prompt: 'Mine.',
    model: 'opus',
    tools: ['Read'],
  });
  expect(await saved.json()).toMatchObject({ prompt: 'Mine.', defaultPrompt: 'Check security.' });
  const refused = await send('PUT', '/api/agents/agent_1', {
    prompt: 'Mine.',
    model: 'opus',
    tools: ['Read', 'Write'],
  });
  expect(refused.status).toBe(400);
  expect((await send('PUT', '/api/agents/agent_7', { prompt: 'p', model: 'opus' })).status).toBe(
    404,
  );
});

test('bad input is a 400, a taken name or a busy writer a 409, an unknown agent a 404', async () => {
  expect((await send('POST', '/api/agents/custom', { name: '', role: 'r' })).status).toBe(400);
  await created('Security');
  expect((await send('POST', '/api/agents/custom', { name: 'security', role: 'r' })).status).toBe(
    409,
  );
  expect((await send('POST', '/api/agents/custom/1/regenerate')).status).toBe(409);
  expect((await send('PATCH', '/api/agents/custom/9', { name: 'X' })).status).toBe(404);
});

test('editing the role keeps the prompt until a regeneration queues the writer again', async () => {
  await created('Security');
  writePrompt(1);
  const edited = await send('PATCH', '/api/agents/custom/1', { role: 'Check secrets only' });
  expect(await edited.json()).toMatchObject({
    prompt: 'Check security.',
    custom: { role: 'Check secrets only', promptStatus: 'ready' },
  });
  const queued = await send('POST', '/api/agents/custom/1/regenerate');
  expect(await queued.json()).toMatchObject({ custom: { promptStatus: 'queued' } });
});

test('a flow preset may name an agent once its prompt is written; deleting it is then refused', async () => {
  await created('Security');
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const flows = [{ id: 'secure', name: 'Secure', steps: ['agent_1', 'implement', 'final_review'] }];
  const early = await send('PATCH', `/api/projects/${project.id}`, { flows });
  expect(early.status).toBe(400);
  writePrompt(1);
  expect((await send('PATCH', `/api/projects/${project.id}`, { flows })).status).toBe(200);
  const refused = await send('DELETE', '/api/agents/custom/1');
  expect(refused.status).toBe(409);
  expect(await refused.text()).toContain('the Secure flow of o/r');
  await send('PATCH', `/api/projects/${project.id}`, { flows: null });
  expect((await send('DELETE', '/api/agents/custom/1')).status).toBe(204);
  expect((await send('GET', '/api/agents/custom/1')).status).toBe(404);
  const agents = (await (await send('GET', '/api/agents')).json()) as AgentConfig[];
  expect(agents.some((agent) => agent.agent === 'agent_1')).toBe(false);
});
