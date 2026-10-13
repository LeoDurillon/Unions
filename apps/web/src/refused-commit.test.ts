import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';

let db: Db;
let app: Hono;
let ticketId: number;

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function refuse(): number {
  return db
    .insert(schema.refusedCommits)
    .values({
      ticketId,
      step: 'implement',
      files: ['page.tsx'],
      hookOutput: 'ESLint found too many warnings',
      diff: '+x',
      diffHash: 'h',
      message: '🐛 highlight the lot',
      report: 'report',
      resumeState: { iterations: 1 },
    })
    .returning()
    .get().id;
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
  db.update(schema.tickets)
    .set({ phase: { kind: 'commit_refused', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  app = createApp(db);
});

test('the refused commit is shown, null when there is none', async () => {
  expect(await (await send('GET', `/api/tickets/${ticketId}/refused-commit`)).json()).toBeNull();
  refuse();
  const shown = (await (await send('GET', `/api/tickets/${ticketId}/refused-commit`)).json()) as {
    files: string[];
    message: string;
  };
  expect(shown).toMatchObject({ files: ['page.tsx'], message: '🐛 highlight the lot' });
});

test('a decision names the refusal the user saw, and committing needs a message', async () => {
  const old = refuse();
  const current = refuse();
  const commands = `/api/tickets/${ticketId}/commands`;
  const stale = await send('POST', commands, {
    type: 'commit_anyway',
    refusalId: old,
    message: 'm',
  });
  expect(stale.status).toBe(409);
  const empty = await send('POST', commands, { type: 'commit_anyway', refusalId: current });
  expect(empty.status).toBe(400);
  const ok = await send('POST', commands, {
    type: 'commit_anyway',
    refusalId: current,
    message: '🐛 highlight the lot',
  });
  expect(ok.status).toBe(202);
  expect(db.select().from(schema.commands).all()).toMatchObject([
    { type: 'commit_anyway', payload: { message: '🐛 highlight the lot' } },
  ]);
});

test('the decisions are refused outside a paused run', async () => {
  const id = refuse();
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  const response = await send('POST', `/api/tickets/${ticketId}/commands`, {
    type: 'drop_leftovers',
    refusalId: id,
  });
  expect(response.status).toBe(409);
});
