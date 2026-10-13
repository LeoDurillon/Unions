import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, parseDiff, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { CommentView, DiffResponse } from './api-types';
import { createApp } from './app';

const DIFF = `diff --git a/math.js b/math.js
index 1111111..2222222 100644
--- a/math.js
+++ b/math.js
@@ -1,3 +1,7 @@
 export function add(a, b) {
-  return a+b;
+  return a + b;
 }
+
+export function subtract(a, b) {
+  return a - b;
+}
`;

let db: Db;
let app: Hono;
let ticketId: number;

function snapshot(headSha: string): number {
  const row = db
    .insert(schema.diffSnapshots)
    .values({ ticketId, baseBranch: 'main', headSha })
    .returning()
    .get();
  for (const [position, file] of parseDiff(DIFF).entries()) {
    db.insert(schema.diffFiles)
      .values({ snapshotId: row.id, position, ...file })
      .run();
  }
  return row.id;
}

function setPhase(step: 'implement' | 'final_review' | null): void {
  const phase = step ? { kind: 'awaiting_approval' as const, step } : { kind: 'backlog' as const };
  db.update(schema.tickets).set({ phase }).where(eq(schema.tickets.id, ticketId)).run();
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
  snapshot('sha1');
});

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('the diff lists touched files without patches; one file is fetched on its own', async () => {
  const diff = (await (await call('GET', '/diff')).json()) as DiffResponse;
  expect(diff.snapshot?.headSha).toBe('sha1');
  expect(
    diff.files.map((file) => [file.path, file.status, file.additions, file.deletions]),
  ).toEqual([['math.js', 'modified', 5, 1]]);
  expect(JSON.stringify(diff)).not.toContain('@@');
  const fileId = diff.files[0]?.id ?? 0;
  const file = (await (await call('GET', `/diff/files/${fileId}`)).json()) as { patch: string };
  expect(file.patch).toContain('+export function subtract');
  expect((await call('GET', '/diff/files/999')).status).toBe(404);
});

test('comments keep the code they point at; lines outside the diff are refused', async () => {
  const created = await call('POST', '/comments', {
    path: 'math.js',
    side: 'new',
    startLine: 5,
    endLine: 7,
    body: 'Guard NaN.',
  });
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({
    excerpt: 'export function subtract(a, b) {\n  return a - b;\n}',
    status: 'draft',
  });
  const removed = await call('POST', '/comments', {
    path: 'math.js',
    side: 'old',
    startLine: 2,
    body: 'Spacing only?',
  });
  expect(await removed.json()).toMatchObject({ excerpt: '  return a+b;', endLine: 2 });
  expect(
    (await call('POST', '/comments', { path: 'math.js', side: 'new', startLine: 40, body: 'x' }))
      .status,
  ).toBe(400);
  expect(
    (await call('POST', '/comments', { path: 'other.js', side: 'new', startLine: 1, body: 'x' }))
      .status,
  ).toBe(400);
  expect(
    (
      await call('POST', '/comments', {
        path: 'math.js',
        side: 'new',
        startLine: 3,
        endLine: 2,
        body: 'x',
      })
    ).status,
  ).toBe(400);
});

test('drafts can be edited and deleted', async () => {
  const draft = (await (
    await call('POST', '/comments', { path: 'math.js', side: 'new', startLine: 2, body: 'a' })
  ).json()) as { id: number };
  await call('PATCH', `/comments/${draft.id}`, { body: 'b' });
  let comments = (await (await call('GET', '/comments')).json()) as CommentView[];
  expect(comments[0]?.body).toBe('b');
  await call('DELETE', `/comments/${draft.id}`);
  comments = (await (await call('GET', '/comments')).json()) as CommentView[];
  expect(comments).toEqual([]);
});

test('sending is only possible when the ticket waits on the user after code was written', async () => {
  await call('POST', '/comments', {
    path: 'math.js',
    side: 'new',
    startLine: 6,
    body: 'Guard NaN.',
  });
  setPhase(null);
  expect((await call('POST', '/review', {})).status).toBe(409);
  setPhase('final_review');
  const sent = await call('POST', '/review', { summary: 'Almost there.' });
  expect(sent.status).toBe(200);
  const [command] = db.select().from(schema.commands).all();
  expect(command?.type).toBe('revise');
  expect(JSON.stringify(command?.payload)).toContain('Guard NaN.');
  expect(JSON.stringify(command?.payload)).toContain('Almost there.');
  const comments = (await (await call('GET', '/comments')).json()) as CommentView[];
  expect(comments[0]?.status).toBe('sent');
  expect((await call('PATCH', `/comments/${comments[0]?.id ?? 0}`, { body: 'x' })).status).toBe(
    409,
  );
});

test('an empty review is refused; a new diff marks older comments outdated', async () => {
  setPhase('implement');
  expect((await call('POST', '/review', { summary: '  ' })).status).toBe(400);
  await call('POST', '/comments', { path: 'math.js', side: 'new', startLine: 6, body: 'x' });
  db.delete(schema.diffSnapshots).run();
  snapshot('sha2');
  const comments = (await (await call('GET', '/comments')).json()) as CommentView[];
  expect(comments[0]?.outdated).toBe(true);
});

test('lock files and the project patterns are flagged as ignored, other files are not', async () => {
  const [lock] = parseDiff(
    'diff --git a/bun.lock b/bun.lock\n--- a/bun.lock\n+++ b/bun.lock\n@@ -1 +1 @@\n-a\n+b\n',
  );
  const snap = db.select().from(schema.diffSnapshots).get();
  if (lock && snap) {
    db.insert(schema.diffFiles)
      .values({ snapshotId: snap.id, position: 1, ...lock })
      .run();
  }
  let diff = (await (await call('GET', '/diff')).json()) as DiffResponse;
  expect(diff.files.map((file) => [file.path, file.ignored])).toEqual([
    ['math.js', false],
    ['bun.lock', true],
  ]);
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main', hideLockFiles: false, reviewIgnore: ['*.js'] } })
    .run();
  diff = (await (await call('GET', '/diff')).json()) as DiffResponse;
  expect(diff.files.map((file) => [file.path, file.ignored])).toEqual([
    ['math.js', true],
    ['bun.lock', false],
  ]);
});

test('a done ticket with its branch takes a review too', async () => {
  await call('POST', '/comments', {
    path: 'math.js',
    side: 'new',
    startLine: 6,
    body: 'Guard NaN.',
  });
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' }, branch: null })
    .run();
  expect((await call('POST', '/review', {})).status).toBe(409);
  db.update(schema.tickets).set({ branch: '1-t' }).run();
  const diff = (await (await call('GET', '/diff')).json()) as DiffResponse;
  expect(diff.canSend).toBe(true);
  expect((await call('POST', '/review', {})).status).toBe(200);
  expect(db.select().from(schema.commands).all()[0]?.type).toBe('revise');
});

test('a done ticket whose pull request is merged takes no more review, and says why', async () => {
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' }, branch: '1-t', prNumber: 9, prState: 'merged' })
    .run();
  const diff = (await (await call('GET', '/diff')).json()) as DiffResponse;
  expect(diff).toMatchObject({
    canSend: false,
    sendRefusal: 'The pull request is merged: open a new ticket for further changes.',
  });
  const refused = await call('POST', '/review', { summary: 'One more thing.' });
  expect(refused.status).toBe(409);
  expect(await refused.text()).toContain('merged');
  // Closed without merging, it can still be reopened: the review stays possible.
  db.update(schema.tickets).set({ prState: 'closed' }).run();
  expect(((await (await call('GET', '/diff')).json()) as DiffResponse).canSend).toBe(true);
});
