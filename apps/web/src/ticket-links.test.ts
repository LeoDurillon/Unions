import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { TicketDetail, TicketSummary } from './api-types';
import { createApp } from './app';

let db: Db;
let app: Hono;
let projectId: number;

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function makeTicket(title: string, parentId?: number): Promise<TicketSummary> {
  const response = await send('POST', '/api/tickets', { projectId, title, parentId });
  expect(response.status).toBe(201);
  return (await response.json()) as TicketSummary;
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

test('a ticket created with a parent lists it; the parent lists its children', async () => {
  const parent = await makeTicket('Search index');
  const child = await makeTicket('Search filters', parent.id);
  expect(child.parent).toEqual({
    id: parent.id,
    title: 'Search index',
    issueNumber: null,
    done: false,
  });

  const list = (await (
    await send('GET', `/api/tickets?projectId=${projectId}`)
  ).json()) as TicketSummary[];
  expect(list.find((row) => row.id === child.id)?.parent?.id).toBe(parent.id);
  const detail = (await (await send('GET', `/api/tickets/${parent.id}`)).json()) as TicketDetail;
  expect(detail.children.map((ref) => ref.id)).toEqual([child.id]);

  const other = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'other', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const foreign = await send('POST', '/api/tickets', {
    projectId: other.id,
    title: 't',
    parentId: parent.id,
  });
  expect(foreign.status).toBe(400);
});

test('start is refused until the parent is done', async () => {
  const parent = await makeTicket('Search index');
  const child = await makeTicket('Search filters', parent.id);
  const blocked = await send('POST', `/api/tickets/${child.id}/commands`, { type: 'start' });
  expect(blocked.status).toBe(409);
  expect(((await blocked.json()) as { error: string }).error).toContain('Search index');

  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, parent.id))
    .run();
  const started = await send('POST', `/api/tickets/${child.id}/commands`, { type: 'start' });
  expect(started.status).toBe(202);
});

test('the parent is changed or removed before the start, cycles refused', async () => {
  const first = await makeTicket('first');
  const second = await makeTicket('second');
  const linked = await send('PUT', `/api/tickets/${second.id}/parent`, { parentId: first.id });
  expect(((await linked.json()) as TicketSummary).parent?.id).toBe(first.id);
  const cycle = await send('PUT', `/api/tickets/${first.id}/parent`, { parentId: second.id });
  expect(cycle.status).toBe(409);
  expect((await send('PUT', `/api/tickets/${first.id}/parent`, { parentId: 'x' })).status).toBe(
    400,
  );
  expect((await send('PUT', '/api/tickets/999/parent', { parentId: null })).status).toBe(404);

  const unlinked = await send('PUT', `/api/tickets/${second.id}/parent`, { parentId: null });
  expect(((await unlinked.json()) as TicketSummary).parent).toBeNull();
});
