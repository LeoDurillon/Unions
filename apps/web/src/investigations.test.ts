import { beforeEach, expect, test } from 'bun:test';

import {
  claimInvestigation,
  createDb,
  emitEvent,
  migrateDb,
  schema,
  type Db,
  type Investigation,
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
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
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

const valid = (): Record<string, unknown> => ({
  title: 'Auth audit',
  prompt: 'List every place we check tokens',
  scope: 'repository',
  model: 'opus',
  tools: ['Read', 'Grep'],
});

function base(): string {
  return `/api/projects/${projectId}/investigations`;
}

async function created(): Promise<Investigation> {
  const response = await send('POST', base(), valid());
  expect(response.status).toBe(201);
  return (await response.json()) as Investigation;
}

test('creates a queued investigation and lists it for its project only', async () => {
  const investigation = await created();
  expect(investigation).toMatchObject({ status: 'queued', scope: 'repository', model: 'opus' });

  const list = (await (await send('GET', base())).json()) as Investigation[];
  expect(list.map((row) => row.id)).toEqual([investigation.id]);
  expect((await send('GET', '/api/projects/999/investigations')).status).toBe(404);
});

test('rejects a bad scope, an unknown tool and an empty prompt with 400', async () => {
  const cases = [{ scope: 'repo' }, { tools: ['Nope'] }, { prompt: ' ' }, { model: 'gpt' }];
  for (const change of cases) {
    const response = await send('POST', base(), { ...valid(), ...change });
    expect(response.status).toBe(400);
  }
  expect(db.select().from(schema.investigations).all()).toEqual([]);
});

test('cancel queues a command; delete is refused while running', async () => {
  const { id } = await created();
  expect((await send('POST', `${base()}/${id}/cancel`)).status).toBe(202);
  expect(db.select().from(schema.commands).all()[0]).toMatchObject({
    type: 'cancel_investigation',
    payload: { investigationId: id },
  });

  claimInvestigation(db);
  expect((await send('DELETE', `${base()}/${id}`)).status).toBe(409);
  expect((await send('POST', `${base()}/${id}/rerun`)).status).toBe(409);
  expect((await send('GET', `${base()}/12345`)).status).toBe(404);
  const other = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'other', config: { baseBranch: 'main' } })
    .returning()
    .get();
  expect((await send('GET', `/api/projects/${other.id}/investigations/${id}`)).status).toBe(404);
});

test('deleting the project is refused while an investigation runs', async () => {
  await created();
  claimInvestigation(db);
  expect((await send('DELETE', `/api/projects/${projectId}`)).status).toBe(409);
});

test('the event stream can follow one investigation', async () => {
  const { id } = await created();
  emitEvent(db, { type: 'agent_event', investigationId: id, payload: { type: 'result' } });
  emitEvent(db, { type: 'agent_event', ticketId: 7, payload: { type: 'result' } });
  const response = await send('GET', `/api/events?investigation=${id}&after=0`);
  const reader = response.body?.getReader();
  const chunk = await reader?.read();
  await reader?.cancel();
  const text = new TextDecoder().decode(chunk?.value);
  expect(text).toContain('event: investigation_queued');
  expect(text).toContain(`"investigationId":${id}`);
  expect(text).not.toContain('"ticketId":7');
});
