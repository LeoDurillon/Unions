// Tests the Explain routes: subjects checked against the diff, conversations, the running ticket refused, spec parts, cancel.

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
import type { ConversationView, ExplanationView } from './routes/review/explanation-views';

const PATCH = '@@ -1,2 +1,3 @@\n const a = 1;\n+const b = 2;\n const c = 3;';
const SPECS = [{ kind: 'pr', label: 'PR description', text: 'Add b.' }];
const RESULT = { explanation: 'Adds b.', specs: [], docs: [], notInSpec: null, dropped: 0 };
const LINE_2 = { kind: 'lines', path: 'a.ts', side: 'new', start: 2 };

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

async function list(): Promise<ConversationView[]> {
  return (await (await call('GET', base)).json()) as ConversationView[];
}

async function asked(body: unknown): Promise<ExplanationView> {
  const response = await call('POST', base, body);
  expect(response.status).toBe(202);
  return (await response.json()) as ExplanationView;
}

function answerNext(): void {
  const claimed = claimExplanation(db);
  finishExplanation(db, claimed?.id ?? 0, { status: 'succeeded', result: RESULT, sessionId: 's' });
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

test('subjects are checked against the diff; lines keep their excerpt', async () => {
  const refused = [
    { subjects: [{ ...LINE_2, start: 9 }] },
    { subjects: [{ kind: 'file', path: 'b.ts' }] },
    { subjects: [{ kind: 'folder' }] },
    { subjects: [] },
  ];
  for (const body of refused) {
    expect((await call('POST', base, body)).status).toBe(400);
  }
  const turn = await asked({
    subjects: [LINE_2, LINE_2, { kind: 'file', path: 'a.ts' }, { kind: 'change' }],
    specs: SPECS,
  });
  expect(turn).toMatchObject({
    status: 'queued',
    subjects: [
      { kind: 'lines', path: 'a.ts', side: 'new', start: 2, end: 2, excerpt: 'const b = 2;' },
      { kind: 'file', path: 'a.ts' },
      { kind: 'change' },
    ],
    specs: ['PR description'],
    outdated: false,
  });
  expect((await list()).map((row) => row.title)).toEqual(['a.ts:2']);
});

test('a running ticket is refused', async () => {
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await call('POST', base, { subjects: [LINE_2] })).status).toBe(409);
});

test("a turn's parts come from the grouping by spec, and a new head marks it outdated", async () => {
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
  await asked({ subjects: [LINE_2] });
  expect((await list())[0]?.turns[0]).toMatchObject({
    specParts: [{ key: 'b', title: 'Add b', spec: 'Add b.' }],
    partsOutdated: false,
    outdated: false,
  });
  db.update(schema.diffSnapshots).set({ headSha: 'h2' }).run();
  expect((await list())[0]?.turns[0]).toMatchObject({ partsOutdated: true, outdated: true });
});

test('a conversation goes on once its answer is in, keeping its specs; cancel goes to the worker', async () => {
  const first = await asked({ subjects: [LINE_2], specs: SPECS });
  const into = { conversationId: first.conversationId, question: 'Why?' };
  expect((await call('POST', base, into)).status).toBe(409);
  answerNext();
  expect((await call('POST', base, { conversationId: 999, question: 'Why?' })).status).toBe(404);
  const next = await asked(into);
  expect(next).toMatchObject({ conversationId: first.conversationId, subjects: [] });
  expect(next.specs).toEqual(['PR description']);
  const [conversation] = await list();
  expect(conversation?.turns.map((turn) => turn.id)).toEqual([first.id, next.id]);
  expect((await call('POST', `${base}/${next.id}/cancel`)).status).toBe(202);
  expect((await call('POST', `${base}/${first.id}/cancel`)).status).toBe(409);
  expect(
    db
      .select()
      .from(schema.commands)
      .all()
      .map((row) => row.payload),
  ).toEqual([{ explanationId: next.id }]);
});

test('a conversation renames, and deletes once nothing waits in it', async () => {
  const turn = await asked({ subjects: [LINE_2], question: 'What is b?' });
  const at = `${base}/conversations/${turn.conversationId}`;
  const renamed = await call('PATCH', at, { title: 'About b' });
  expect(await renamed.json()).toMatchObject({ id: turn.conversationId, title: 'About b' });
  expect((await call('DELETE', at)).status).toBe(409);
  answerNext();
  expect((await call('DELETE', at)).status).toBe(204);
  expect(await list()).toEqual([]);
  expect((await call('DELETE', at)).status).toBe(404);
});
