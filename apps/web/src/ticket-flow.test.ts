import { beforeEach, expect, test } from 'bun:test';

import { createDb, dispatch, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import type { TicketSummary } from './api-types';
import { createApp } from './app';

let db: Db;
let app: Hono;
let projectId: number;

function send(method: string, path: string, body: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

test('a ticket is created with its flow, which changes until it starts', async () => {
  const quick = ['implement', 'final_review'] as const;
  const created = await send('POST', '/api/tickets', { projectId, title: 'Typo', flow: quick });
  expect(created.status).toBe(201);
  const ticket = (await created.json()) as TicketSummary;
  expect(ticket.flow).toEqual([...quick]);

  const reset = await send('PUT', `/api/tickets/${ticket.id}/flow`, { flow: null });
  expect(((await reset.json()) as TicketSummary).flow).toBeNull();

  dispatch(db, ticket.id, { type: 'start' });
  const late = await send('PUT', `/api/tickets/${ticket.id}/flow`, { flow: quick });
  expect(late.status).toBe(409);
});

test('steps that are no flow are refused', async () => {
  const response = await send('POST', '/api/tickets', {
    projectId,
    title: 'Typo',
    flow: ['final_review', 'implement'],
  });
  expect(response.status).toBe(400);
  expect(await response.text()).toContain('pipeline order');
});
