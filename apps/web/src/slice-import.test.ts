import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, parseDiff, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { CommentView, PullRequestNote, PullRequestThread } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const HEADER =
  'diff --git a/math.js b/math.js\nindex 1111111..2222222 100644\n--- a/math.js\n+++ b/math.js\n';
const ADD = ' export function add(a, b) {\n   return a + b;\n }\n';
const SUBTRACT = '+export function subtract(a, b) {\n+  return a - b;\n+}\n';
const MULTIPLY = '+export function multiply(a, b) {\n+  return a * b;\n+}\n';
// Slice 1 (#41) adds `subtract` under `add`; slice 2 (#42, the ticket's own) adds `multiply` above.
const SLICE_1 = `${HEADER}@@ -1,3 +1,6 @@\n${ADD}${SUBTRACT}`;
const SLICE_2 = `${HEADER}@@ -1,3 +1,6 @@\n${MULTIPLY}${ADD}`;
const WHOLE = `${HEADER}@@ -1,3 +1,9 @@\n${MULTIPLY}${ADD}${SUBTRACT}`;

function thread(pr: number, id: number, line: number): PullRequestThread {
  return {
    resolved: false,
    path: 'math.js',
    side: 'new',
    line,
    startLine: line - 2,
    originalLine: line,
    originalStartLine: line - 2,
    comments: [
      {
        author: 'alice',
        body: 'Test this.',
        url: `https://github.com/acme/shop/pull/${pr}#discussion_r${id}`,
        createdAt: '2026-10-01T10:00:00Z',
        diffHunk: '@@ -1,1 +1,1 @@\n+x',
        commitSha: 'gh',
      },
    ],
  };
}

function note(pr: number): PullRequestNote {
  return {
    kind: 'comment',
    author: 'bob',
    bot: false,
    body: 'Split this further.',
    url: `https://github.com/acme/shop/pull/${pr}#issuecomment-1`,
    state: null,
    createdAt: '2026-10-01T11:00:00Z',
  };
}

const THREADS: Record<number, PullRequestThread[]> = {
  41: [thread(41, 1, 6)],
  42: [thread(42, 2, 3)],
};

const github = {
  getDiscussion: (_auth: unknown, _repo: unknown, number: number) =>
    Promise.resolve({ description: '', threads: THREADS[number] ?? [], notes: [note(number)] }),
} as unknown as OnboardingGitHub;

let db: Db;
let app: Hono;
let ticketId: number;

function insertFiles(
  diff: string,
  insert: (file: ReturnType<typeof parseDiff>[number]) => void,
): void {
  for (const file of parseDiff(diff)) {
    insert(file);
  }
}

function addSlice(snapshotId: number, position: number, prNumber: number, diff: string): void {
  db.insert(schema.ticketSlices)
    .values({
      ticketId,
      position,
      title: `s${position}`,
      spec: '',
      tipSha: `tip${position}`,
      branch: `b${position}`,
      prNumber,
    })
    .run();
  const row = db
    .insert(schema.diffCommits)
    .values({ snapshotId, kind: 'slice', position, sha: `tip${position}`, title: `s${position}` })
    .returning()
    .get();
  insertFiles(diff, (file) => {
    db.insert(schema.diffCommitFiles)
      .values({ commitId: row.id, position: 0, ...file })
      .run();
  });
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'tok', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
  db.update(schema.tickets).set({ prNumber: 42 }).where(eq(schema.tickets.id, ticketId)).run();
  const snapshot = db
    .insert(schema.diffSnapshots)
    .values({ ticketId, baseBranch: 'main', headSha: 'tip2' })
    .returning()
    .get();
  insertFiles(WHOLE, (file) => {
    db.insert(schema.diffFiles)
      .values({ snapshotId: snapshot.id, position: 0, ...file })
      .run();
  });
  addSlice(snapshot.id, 1, 41, SLICE_1);
  addSlice(snapshot.id, 2, 42, SLICE_2);
});

function post(path: string, body?: unknown): Promise<Response> | Response {
  return app.request(`/api/tickets/${ticketId}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

async function comments(): Promise<CommentView[]> {
  const response = await app.request(`/api/tickets/${ticketId}/comments`);
  return (await response.json()) as CommentView[];
}

test("a slice's thread lands on its slice's own lines, not the stack's", async () => {
  await post('/comments/import?pr=41');
  await post('/comments/import');
  const [lower, top] = await comments();
  // Lines 4 to 6 of the whole change are `add`: slice 1's own lines are `subtract`.
  expect(lower).toMatchObject({
    slicePosition: 1,
    headSha: 'tip1',
    startLine: 4,
    endLine: 6,
    excerpt: 'export function subtract(a, b) {\n  return a - b;\n}',
    outdated: false,
  });
  expect(top).toMatchObject({
    slicePosition: 2,
    headSha: 'tip2',
    excerpt: 'export function multiply(a, b) {\n  return a * b;\n}',
    outdated: false,
  });
});

test('a slice comment goes out of date when its slice moves, not when another does', async () => {
  await post('/comments/import?pr=41');
  await post('/comments/import');
  db.update(schema.diffCommits)
    .set({ sha: 'tip1-new' })
    .where(eq(schema.diffCommits.position, 1))
    .run();
  expect((await comments()).map((comment) => [comment.slicePosition, comment.outdated])).toEqual([
    [1, true],
    [2, false],
  ]);
});

test("a slice's conversation comment is imported on that slice", async () => {
  const { url } = note(41);
  expect((await post('/comments/import-note?pr=41', { url })).status).toBe(201);
  expect(await comments()).toMatchObject([
    { kind: 'general', slicePosition: 1, headSha: 'tip1', githubUrl: url },
  ]);
});

test('a ticket not split imports on the whole change, without a slice', async () => {
  db.delete(schema.ticketSlices).run();
  await post('/comments/import');
  expect(await comments()).toMatchObject([{ slicePosition: null, headSha: 'tip2' }]);
});

test("a comment written on a slice is on that slice's own lines", async () => {
  const lines = { path: 'math.js', side: 'new', startLine: 4, endLine: 6, body: 'Why?' };
  expect((await post('/comments?slice=1', lines)).status).toBe(201);
  expect(await comments()).toMatchObject([
    {
      slicePosition: 1,
      headSha: 'tip1',
      excerpt: 'export function subtract(a, b) {\n  return a - b;\n}',
    },
  ]);
  expect((await post('/comments?slice=9', lines)).status).toBe(404);
});
