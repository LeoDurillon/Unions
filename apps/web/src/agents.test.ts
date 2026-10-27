import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  DEFAULT_PROMPTS,
  migrateDb,
  resolveAgent,
  type AgentConfig,
  type Db,
  type ToolOption,
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
    ['review_comments', 'opus', false],
    ['review_groups', 'sonnet', false],
    ['review_explain', 'haiku', false],
    ['review_report', 'opus', false],
    ['pr_description', 'opus', false],
    ['pr_replies', 'opus', false],
    ['rebase', null, false],
    ['simplify', null, false],
    ['split_plan', 'opus', false],
    ['split', null, false],
    ['lesson_writer', 'haiku', false],
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

test('tools: added to the list, selected for an agent, removed once unused', async () => {
  const added = await send('POST', '/api/agents/tools', {
    name: 'Bash(pnpm lint*)',
    description: 'Lint',
  });
  expect(added.status).toBe(201);
  expect((await send('POST', '/api/agents/tools', { name: 'two words' })).status).toBe(400);
  const tools = (await (await send('GET', '/api/agents/tools')).json()) as ToolOption[];
  expect(tools.at(-1)).toEqual({ name: 'Bash(pnpm lint*)', description: 'Lint', source: 'custom' });

  const { prompt, model } = resolveAgent(db, 'implement');
  const saved = await send('PUT', '/api/agents/implement', {
    prompt,
    model,
    tools: ['Read', 'Skill', 'Bash(pnpm lint*)'],
  });
  expect(((await saved.json()) as AgentConfig).tools).toEqual([
    'Read',
    'Skill',
    'Bash(pnpm lint*)',
  ]);
  const unknown = await send('PUT', '/api/agents/implement', { prompt, model, tools: ['Nope'] });
  expect(unknown.status).toBe(400);
  expect(
    (await send('PUT', '/api/agents/implement', { prompt, model, tools: 'Read' })).status,
  ).toBe(400);

  const path = `/api/agents/tools/${encodeURIComponent('Bash(pnpm lint*)')}`;
  expect((await send('DELETE', path)).status).toBe(409);
  await send('DELETE', '/api/agents/implement');
  expect((await send('DELETE', path)).status).toBe(200);
});

function saveEffort(effort: unknown): Response | Promise<Response> {
  return send('PUT', '/api/agents/implement', {
    prompt: DEFAULT_PROMPTS.implement,
    model: 'opus',
    effort,
  });
}

test('an effort is saved with the model, cleared by null, and refused when unknown', async () => {
  expect(await (await saveEffort('max')).json()).toMatchObject({ effort: 'max', model: 'opus' });
  expect(resolveAgent(db, 'implement').effort).toBe('max');
  expect((await saveEffort('extreme')).status).toBe(400);
  expect(resolveAgent(db, 'implement').effort).toBe('max');
  await saveEffort(null);
  expect(resolveAgent(db, 'implement').effort).toBeNull();
});
