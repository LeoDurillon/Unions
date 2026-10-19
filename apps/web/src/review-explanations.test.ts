// Tests the explanation routes: lines checked against the diff, the running ticket refused, spec parts, follow-ups, cancel.
import { beforeEach, expect, test } from 'bun:test';

import {
  claimExplanation,
  createDb,
  createTicket,
  finishExplanation,
  migrateDb,
  queueGrouping,
  schema,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { ExplanationView } from './routes/review-explanations';

const PATCH = '@@ -1,2 +1,3 @@\n const a = 1;\n+const b = 2;\n const c = 3;';
const SPECS = [{ kind: 'pr', label: 'PR description', text: 'Add b.' }];
const RESULT = { explanation: 'Adds b.', specs: [], docs: [], notInSpec: null, dropped: 0 };

let db: Db;
let app: Hono;
let ticketId: number;
let base: string;

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function list(): Promise<ExplanationView[]> {
  return (await (await call('GET', base)).json()) as ExplanationView[];
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Add b' }).id;
  base = `/api/tickets/${ticketId}/explanations`;
  db.update(schema.tickets).set({ branch: 'feature' }).where(eq(schema.tickets.id, ticketId)).run();
  const snapshot = db
    .insert(schema.diffSnapshots)
    .values({ ticketId, baseBranch: 'main', headSha: 'h1' })
    .returning()
    .get();
  db.insert(schema.diffFiles)
    .values({
      snapshotId: snapshot.id,
      position: 0,
      path: 'a.ts',
      oldPath: 'a.ts',
      status: 'modified',
      binary: false,
      additions: 1,
      deletions: 0,
      patch: PATCH,
    })
    .run();
});

test('lines of the diff are queued with their excerpt; others, and a running ticket, are refused', async () => {
  const outside = await call('POST', base, { path: 'a.ts', side: 'new', start: 9, specs: SPECS });
  expect(outside.status).toBe(400);
  const elsewhere = await call('POST', base, { path: 'b.ts', side: 'new', start: 1 });
  expect(elsewhere.status).toBe(400);
  const queued = await call('POST', base, { path: 'a.ts', side: 'new', start: 2, specs: SPECS });
  expect(queued.status).toBe(202);
  expect(await queued.json()).toMatchObject({
    status: 'queued',
    excerpt: 'const b = 2;',
    specs: ['PR description'],
    outdated: false,
  });
  const again = await call('POST', base, { path: 'a.ts', side: 'new', start: 2 });
  expect(again.status).toBe(409);
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  const running = await call('POST', base, { path: 'a.ts', side: 'new', start: 1 });
  expect(running.status).toBe(409);
});

test("the lines' parts come from the grouping by spec, and a new head marks it outdated", async () => {
  const grouping = queueGrouping(
    db,
    { kind: 'ticket', id: ticketId },
    { kind: 'pr', label: 'PR', spec: 'x' },
  );
  db.update(schema.reviewGroupings)
    .set({
      status: 'succeeded',
      headSha: 'h1',
      result: {
        groups: [{ key: 'b', title: 'Add b', spec: 'Add b.', summary: '', files: ['a.ts'] }],
        unrelated: [],
        missing: [],
      },
    })
    .where(eq(schema.reviewGroupings.id, grouping.id))
    .run();
  await call('POST', base, { path: 'a.ts', side: 'new', start: 2 });
  expect((await list())[0]).toMatchObject({
    specParts: [{ key: 'b', title: 'Add b', spec: 'Add b.' }],
    partsOutdated: false,
    outdated: false,
  });
  db.update(schema.diffSnapshots).set({ headSha: 'h2' }).run();
  expect((await list())[0]).toMatchObject({ partsOutdated: true, outdated: true });
});

test('a follow-up asks about the same lines once the answer is in; cancel goes to the worker', async () => {
  await call('POST', base, { path: 'a.ts', side: 'new', start: 2, specs: SPECS });
  const [first] = await list();
  const early = await call('POST', base, { parentId: first?.id, question: 'Why?' });
  expect(early.status).toBe(409);
  const claimed = claimExplanation(db);
  finishExplanation(db, claimed?.id ?? 0, { status: 'succeeded', result: RESULT, sessionId: 's' });
  expect((await call('POST', base, { parentId: first?.id })).status).toBe(400);
  const follow = await call('POST', base, { parentId: first?.id, question: 'Why?' });
  expect(await follow.json()).toMatchObject({
    parentId: first?.id,
    path: 'a.ts',
    startLine: 2,
    question: 'Why?',
    specs: ['PR description'],
  });
  const [latest] = await list();
  expect((await call('POST', `${base}/${latest?.id}/cancel`)).status).toBe(202);
  expect((await call('POST', `${base}/${first?.id}/cancel`)).status).toBe(409);
  expect(
    db
      .select()
      .from(schema.commands)
      .all()
      .map((row) => row.payload),
  ).toEqual([{ explanationId: latest?.id }]);
});
