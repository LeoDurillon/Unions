import { beforeEach, expect, test } from 'bun:test';

import {
  claimPrDescription,
  createDb,
  createTicket,
  finishPrDescription,
  migrateDb,
  schema,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { PrDescriptionView } from './api-types';
import { createApp } from './app';

let db: Db;
let app: Hono;
let ticketId: number;

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/pr-description${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function view(): Promise<PrDescriptionView> {
  return (await (await call('GET', '')).json()) as PrDescriptionView;
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Search', body: '' }).id;
});

function setTicket(values: Partial<typeof schema.tickets.$inferInsert>): void {
  db.update(schema.tickets).set(values).where(eq(schema.tickets.id, ticketId)).run();
}

test('a rewrite needs an open pull request and no run in progress', async () => {
  expect((await view()).refusal).toBe('The ticket has no pull request.');
  expect((await call('POST', '')).status).toBe(409);
  setTicket({ prNumber: 4, prState: 'merged' });
  expect((await view()).refusal).toBe('The pull request is merged.');
  setTicket({ prState: 'open', phase: { kind: 'running', step: 'implement' } });
  expect((await call('POST', '')).status).toBe(409);
  setTicket({ phase: { kind: 'done' } });
  expect((await call('POST', '')).status).toBe(202);
  expect((await view()).draft?.status).toBe('queued');
  expect((await call('POST', '')).status).toBe(409);
});

test('sending the edited draft queues the update for the worker; discarding drops it', async () => {
  setTicket({ prNumber: 4, prState: 'open', phase: { kind: 'done' } });
  await call('POST', '');
  const row = claimPrDescription(db);
  if (!row) {
    throw new Error('not queued');
  }
  finishPrDescription(db, row.id, {
    status: 'ready',
    original: 'Old\n\nCloses #3',
    text: 'New',
  });
  expect((await view()).draft).toMatchObject({ status: 'ready', original: 'Old', text: 'New' });

  expect((await call('POST', `/${row.id}/send`, { text: '' })).status).toBe(409);
  expect((await call('POST', `/${row.id}/send`, { text: 'New, edited' })).status).toBe(202);
  expect((await view()).draft).toMatchObject({ status: 'sending', text: 'New, edited' });
  const commands = db.select().from(schema.commands).all();
  expect(commands).toMatchObject([
    { type: 'update_pr_description', ticketId, payload: { prDescriptionId: row.id } },
  ]);
  expect((await call('POST', `/${row.id}/discard`)).status).toBe(409);
  expect((await call('POST', '/999/discard')).status).toBe(404);
});

test("a split ticket's rewrite drafts each open slice's description, shown by ?pr=", async () => {
  setTicket({ prNumber: 4, prState: 'open', phase: { kind: 'done' } });
  for (const [position, prNumber] of [
    [1, 2],
    [2, 4],
  ] as const) {
    db.insert(schema.ticketSlices)
      .values({
        ticketId,
        position,
        title: 't',
        spec: 's',
        tipSha: 'a',
        branch: `b${position}`,
        prNumber,
        prState: 'open',
      })
      .run();
  }
  expect((await call('POST', '?pr=2')).status).toBe(202);
  const rows = db.select().from(schema.prDescriptions).all();
  expect(rows.map((row) => row.prNumber)).toEqual([2, 4]);
  const [lower] = rows;
  claimPrDescription(db);
  finishPrDescription(db, lower?.id ?? 0, { status: 'ready', original: 'Old', text: 'Lower' });
  const shown = (await (await call('GET', '?pr=2')).json()) as PrDescriptionView;
  expect(shown.draft).toMatchObject({ status: 'ready', text: 'Lower' });
  expect((await view()).draft?.status).toBe('queued');
  expect((await call('GET', '?pr=7')).status).toBe(404);
});
