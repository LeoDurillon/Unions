import { beforeEach, expect, test } from 'bun:test';

import {
  claimInvestigation,
  finishInvestigation,
  createDb,
  emitEvent,
  migrateDb,
  saveNotionConnection,
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
  emitEvent(db, { type: 'investigation_started', investigationId: id, payload: {} });
  emitEvent(db, { type: 'ticket_updated_from_github', ticketId: 7, payload: {} });
  const response = await send('GET', `/api/events?investigation=${id}&after=0`);
  const reader = response.body?.getReader();
  const chunk = await reader?.read();
  await reader?.cancel();
  const text = new TextDecoder().decode(chunk?.value);
  expect(text).toContain('"type":"investigation_queued"');
  expect(text).toContain(`"investigationId":${id}`);
  expect(text).not.toContain('"ticketId":7');
});

test('a follow-up is asked on an answered investigation only', async () => {
  const { id } = await created();
  const ask = (prompt: string): Promise<Response> | Response =>
    send('POST', `${base()}/${id}/follow-up`, { prompt });
  expect((await ask('And the refresh tokens?')).status).toBe(409);

  claimInvestigation(db);
  finishInvestigation(db, id, { status: 'succeeded', result: 'In auth.ts' });
  expect((await ask(' ')).status).toBe(400);
  const response = await ask('And the refresh tokens?');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: 'queued',
    prompt: 'And the refresh tokens?',
    history: [{ prompt: 'List every place we check tokens', answer: 'In auth.ts' }],
  });
});

test('a ticket is asked from an answered investigation, once at a time', async () => {
  const { id } = await created();
  expect((await send('POST', `${base()}/${id}/ticket`, { context: 'x' })).status).toBe(409);
  claimInvestigation(db);
  finishInvestigation(db, id, { status: 'succeeded', result: 'Found it.' });
  const asked = await send('POST', `${base()}/${id}/ticket`, { context: ' Backend only ' });
  expect(asked.status).toBe(202);
  expect(await asked.json()).toMatchObject({
    ticketStatus: 'queued',
    ticketContext: 'Backend only',
    ticketTarget: null,
  });
  expect((await send('POST', `${base()}/${id}/ticket`, {})).status).toBe(409);
});

test('a ticket is asked in a tracker only when the project is connected to it', async () => {
  const { id } = await created();
  claimInvestigation(db);
  finishInvestigation(db, id, { status: 'succeeded', result: 'Found it.' });
  const inNotion = { context: '', target: 'notion' };
  expect((await send('POST', `${base()}/${id}/ticket`, inNotion)).status).toBe(409);
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: 'source' });
  const asked = await send('POST', `${base()}/${id}/ticket`, inNotion);
  expect(await asked.json()).toMatchObject({ ticketStatus: 'queued', ticketTarget: 'notion' });
});

test("a ticket investigation names the project's ticket it runs on", async () => {
  const ticket = db
    .insert(schema.tickets)
    .values({ projectId, title: 'Campaign', body: '' })
    .returning()
    .get();
  const response = await send('POST', base(), {
    ...valid(),
    scope: 'ticket',
    onTicketId: ticket.id,
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ scope: 'ticket', onTicketId: ticket.id });
  expect((await send('POST', base(), { ...valid(), scope: 'ticket' })).status).toBe(400);
  const repository = (await (
    await send('POST', base(), { ...valid(), onTicketId: ticket.id })
  ).json()) as Investigation;
  expect(repository.onTicketId).toBeNull();
});
