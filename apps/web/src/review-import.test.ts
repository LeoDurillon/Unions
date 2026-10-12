import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, parseDiff, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type {
  CommentView,
  DiscussionResponse,
  PullRequestNote,
  PullRequestThread,
  ReviewImportResult,
} from './api-types';
import { createApp } from './app';
import { toNotes, toThread } from './github-discussion';
import type { OnboardingGitHub } from './github-onboarding';

const DIFF = `diff --git a/math.js b/math.js
index 1111111..2222222 100644
--- a/math.js
+++ b/math.js
@@ -1,3 +1,6 @@
 export function add(a, b) {
-  return a+b;
+  return a + b;
 }
+export function subtract(a, b) {
+  return a - b;
+}
`;

function comment(id: number, author: string, body: string): PullRequestThread['comments'][number] {
  return {
    author,
    body,
    url: `https://github.com/acme/shop/pull/7#discussion_r${id}`,
    createdAt: '2026-10-01T10:00:00Z',
    diffHunk: '@@ -1,3 +1,4 @@\n export function old() {\n-  return 1;\n+  return 2;',
    commitSha: 'gh-old',
  };
}

const THREADS: PullRequestThread[] = [
  {
    resolved: false,
    path: 'math.js',
    side: 'new',
    line: 6,
    startLine: 4,
    originalLine: 6,
    originalStartLine: 4,
    comments: [comment(11, 'alice', 'Add a test for this.'), comment(12, 'bob', 'Agreed.')],
  },
  {
    resolved: false,
    path: 'gone.js',
    side: 'new',
    line: null,
    startLine: null,
    originalLine: 2,
    originalStartLine: null,
    comments: [comment(21, 'alice', 'Typo.')],
  },
  {
    resolved: true,
    path: 'math.js',
    side: 'old',
    line: 2,
    startLine: null,
    originalLine: 2,
    originalStartLine: null,
    comments: [comment(31, 'carol', 'Fixed already.')],
  },
];

let db: Db;
let app: Hono;
let ticketId: number;
const NOTES: PullRequestNote[] = [
  {
    kind: 'review',
    author: 'coderabbitai',
    bot: true,
    body: '<!-- internal marker -->\nNitpick: rename x.',
    url: 'https://github.com/acme/shop/pull/7#pullrequestreview-1',
    state: 'COMMENTED',
    createdAt: '2026-10-01T10:00:00Z',
  },
  {
    kind: 'comment',
    author: 'alice',
    body: 'Please also update the docs.',
    bot: false,
    url: 'https://github.com/acme/shop/pull/7#issuecomment-2',
    state: null,
    createdAt: '2026-10-01T11:00:00Z',
  },
];

let threads: PullRequestThread[] | null;

const github = {
  getDiscussion: () => Promise.resolve(threads ? { description: '', threads, notes: NOTES } : null),
} as unknown as OnboardingGitHub;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github);
  threads = THREADS;
  const project = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'tok', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
  db.update(schema.tickets).set({ prNumber: 7 }).where(eq(schema.tickets.id, ticketId)).run();
  const snapshot = db
    .insert(schema.diffSnapshots)
    .values({ ticketId, baseBranch: 'main', headSha: 'sha1' })
    .returning()
    .get();
  for (const [position, file] of parseDiff(DIFF).entries()) {
    db.insert(schema.diffFiles)
      .values({ snapshotId: snapshot.id, position, ...file })
      .run();
  }
});

function importComments(): Promise<Response> | Response {
  return app.request(`/api/tickets/${ticketId}/comments/import`, { method: 'POST' });
}

async function comments(): Promise<CommentView[]> {
  const response = await app.request(`/api/tickets/${ticketId}/comments`);
  return (await response.json()) as CommentView[];
}

test('unresolved threads become drafts on their current lines, with the replies', async () => {
  const response = await importComments();
  expect((await response.json()) as ReviewImportResult).toEqual({
    imported: 2,
    alreadyImported: 0,
    resolved: 1,
  });
  const [current, outdated] = await comments();
  expect(current).toMatchObject({
    path: 'math.js',
    side: 'new',
    startLine: 4,
    endLine: 6,
    excerpt: 'export function subtract(a, b) {\n  return a - b;\n}',
    status: 'draft',
    outdated: false,
    kind: 'line',
    body: '**@alice** on GitHub:\n\nAdd a test for this.\n\n**@bob** replied:\n\nAgreed.',
  });
  expect(current?.githubUrl).toContain('discussion_r11');
  // Its file is no longer in the diff: kept on its original line, outdated, with GitHub's excerpt.
  expect(outdated).toMatchObject({
    path: 'gone.js',
    startLine: 2,
    endLine: 2,
    excerpt: '  return 2;',
    outdated: true,
  });
});

test('a second import skips the threads already imported, even once sent or edited', async () => {
  await importComments();
  db.update(schema.reviewComments).set({ status: 'sent', body: 'edited' }).run();
  const again = (await (await importComments()).json()) as ReviewImportResult;
  expect(again).toEqual({ imported: 0, alreadyImported: 2, resolved: 1 });
  expect(await comments()).toHaveLength(2);
});

test('refused without a linked pull request, credentials, or when GitHub has no such PR', async () => {
  threads = null;
  expect((await importComments()).status).toBe(404);

  db.update(schema.projects).set({ githubToken: null }).run();
  const previous = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  expect((await importComments()).status).toBe(409);
  if (previous !== undefined) {
    process.env.GITHUB_TOKEN = previous;
  }

  db.update(schema.tickets).set({ prNumber: null }).run();
  expect((await importComments()).status).toBe(409);
});

function post(path: string, body: unknown): Promise<Response> | Response {
  return app.request(`/api/tickets/${ticketId}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('the discussion lists threads and notes, and marks what is already imported', async () => {
  await importComments();
  const response = await app.request(`/api/tickets/${ticketId}/pull-request/discussion`);
  const discussion = (await response.json()) as DiscussionResponse;
  expect(discussion.url).toBe('https://github.com/acme/shop/pull/7');
  expect(discussion.notes.map((note) => note.author)).toEqual(['coderabbitai', 'alice']);
  expect(discussion.imported).toEqual([
    'https://github.com/acme/shop/pull/7#discussion_r11',
    'https://github.com/acme/shop/pull/7#discussion_r21',
  ]);
});

test('a review summary or comment is imported on its own as a general draft, once', async () => {
  const url = NOTES[0]?.url;
  expect((await post('/comments/import-note', { url })).status).toBe(201);
  expect(await comments()).toMatchObject([
    {
      kind: 'general',
      path: '',
      status: 'draft',
      outdated: false,
      githubUrl: url,
      body: '**@coderabbitai** reviewed on GitHub:\n\nNitpick: rename x.',
    },
  ]);
  expect((await post('/comments/import-note', { url })).status).toBe(409);
  expect((await post('/comments/import-note', { url: 'https://elsewhere' })).status).toBe(404);
});

function rawAuthor(login: string, bot = false): { __typename: string; login: string } {
  return { __typename: bot ? 'Bot' : 'User', login };
}

test('notes: empty review summaries are left out, bots flagged, oldest first', () => {
  const notes = toNotes(
    [
      {
        author: rawAuthor('bob'),
        body: ' ',
        url: 'r1',
        createdAt: '2026-01-02',
        state: 'APPROVED',
      },
      { author: rawAuthor('ci', true), body: 'Looks off', url: 'r2', createdAt: '2026-01-03' },
    ],
    [{ author: null, body: 'First!', url: 'c1', createdAt: '2026-01-01' }, null],
  );
  expect(notes.map((note) => [note.kind, note.author, note.bot, note.url])).toEqual([
    ['comment', 'ghost', false, 'c1'],
    ['review', 'ci', true, 'r2'],
  ]);
});

test("GitHub's thread shape maps to ours: LEFT is the old side, deleted authors are ghosts", () => {
  const thread = toThread({
    isResolved: false,
    path: 'a.ts',
    diffSide: 'LEFT',
    line: 3,
    startLine: null,
    originalLine: 3,
    originalStartLine: null,
    comments: {
      nodes: [
        {
          author: null,
          body: 'Why?',
          url: 'u',
          createdAt: 't',
          diffHunk: 'h',
          originalCommit: { oid: 'abc' },
        },
        null,
      ],
    },
  });
  expect(thread).toMatchObject({ side: 'old', line: 3 });
  expect(thread.comments).toEqual([
    { author: 'ghost', body: 'Why?', url: 'u', createdAt: 't', diffHunk: 'h', commitSha: 'abc' },
  ]);
});
