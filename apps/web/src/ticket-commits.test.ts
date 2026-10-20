import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, parseDiff, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import type { CommitDiffResponse, CommitsResponse } from './api-types';
import { createApp } from './app';

const DIFF = `diff --git a/math.js b/math.js
index 1111111..2222222 100644
--- a/math.js
+++ b/math.js
@@ -1 +1 @@
-old
+new
`;
const FIRST = 'a'.repeat(40);
const SECOND = 'b'.repeat(40);
const THIRD = 'c'.repeat(40);

let db: Db;
let app: Hono;
let ticketId: number;

function addCommit(
  snapshotId: number,
  row: { kind: 'commit' | 'since_review' | 'slice'; position: number; sha: string; title: string },
): void {
  const commit = db
    .insert(schema.diffCommits)
    .values({ snapshotId, ...row })
    .returning()
    .get();
  for (const [position, file] of parseDiff(DIFF).entries()) {
    db.insert(schema.diffCommitFiles)
      .values({ commitId: commit.id, position, ...file })
      .run();
  }
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
});

function get(path: string): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/commits${path}`);
}

function snapshot(): number {
  return db
    .insert(schema.diffSnapshots)
    .values({ ticketId, baseBranch: 'main', headSha: THIRD })
    .returning()
    .get().id;
}

test('no snapshot yet: no commits', async () => {
  expect(await (await get('')).json()).toEqual({ commits: [], sinceReview: null });
});

test('the commits come in order, with the count of those since the reviewed head', async () => {
  const id = snapshot();
  addCommit(id, { kind: 'since_review', position: 0, sha: FIRST, title: 'Since last review' });
  addCommit(id, { kind: 'commit', position: 1, sha: FIRST, title: 'Add math' });
  addCommit(id, { kind: 'commit', position: 2, sha: SECOND, title: 'Fix math' });
  addCommit(id, { kind: 'commit', position: 3, sha: THIRD, title: 'Tidy math' });
  const listed = (await (await get('')).json()) as CommitsResponse;
  expect(listed.commits.map((commit) => commit.title)).toEqual([
    'Add math',
    'Fix math',
    'Tidy math',
  ]);
  expect(listed.sinceReview).toEqual({ sha: FIRST, commits: 2 });
  const since = (await (await get('/since-review/diff')).json()) as CommitDiffResponse;
  expect(since.files.map((file) => file.path)).toEqual(['math.js']);
  const one = (await (await get(`/${SECOND}/diff`)).json()) as CommitDiffResponse;
  const file = (await (await get(`/${SECOND}/files/${one.files[0]?.id ?? 0}`)).json()) as {
    patch: string;
  };
  expect(file.patch).toContain('+new');
  // A file of another commit is not served under this one.
  expect((await get(`/${THIRD}/files/${one.files[0]?.id ?? 0}`)).status).toBe(404);
});

test('a commit outside the newest snapshot, or no review yet, is not found', async () => {
  const id = snapshot();
  addCommit(id, { kind: 'commit', position: 1, sha: FIRST, title: 'Add math' });
  expect((await get(`/${SECOND}/diff`)).status).toBe(404);
  expect((await get('/since-review/diff')).status).toBe(404);
});

test("a split ticket's slices are listed apart and read like a commit, by `slice-<n>`", async () => {
  const id = snapshot();
  addCommit(id, { kind: 'commit', position: 1, sha: FIRST, title: 'Add math' });
  addCommit(id, { kind: 'slice', position: 1, sha: FIRST, title: 'Math' });
  addCommit(id, { kind: 'slice', position: 2, sha: THIRD, title: 'Tidy' });
  const listed = (await (await get('')).json()) as CommitsResponse;
  expect(listed.commits.map((commit) => commit.title)).toEqual(['Add math']);
  expect(listed.slices).toEqual([
    { position: 1, title: 'Math', sha: FIRST },
    { position: 2, title: 'Tidy', sha: THIRD },
  ]);
  const slice = (await (await get('/slice-2/diff')).json()) as CommitDiffResponse;
  expect(slice.sha).toBe(THIRD);
  expect(slice.files.map((file) => file.path)).toEqual(['math.js']);
  expect((await get('/slice-3/diff')).status).toBe(404);
});
