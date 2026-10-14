import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import type { CommitDiffResponse, CommitsResponse, ReviewCommit } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';
import { toPullRequestFile } from './github-pull-request-files';

const FIRST = 'a'.repeat(40);
const SECOND = 'b'.repeat(40);
const PATCH = '@@ -1 +1 @@\n-old\n+new';

let db: Db;
let app: Hono;
let projectId: number;
let reads: string[];

const commits: ReviewCommit[] = [
  { sha: FIRST, title: 'Add math', body: '', author: 'alice', date: null, parents: 1 },
  { sha: SECOND, title: 'Fix math', body: 'Rounding.', author: 'alice', date: null, parents: 1 },
];

const github = {
  listReviewCommits: () => Promise.resolve(commits),
  getCommitFiles: (_auth: unknown, _repo: unknown, sha: string) => {
    reads.push(sha);
    return Promise.resolve(
      sha === FIRST
        ? [
            toPullRequestFile(
              { filename: 'math.js', status: 'added', additions: 1, deletions: 0, patch: PATCH },
              0,
            ),
            toPullRequestFile(
              {
                filename: 'bun.lock',
                status: 'modified',
                additions: 1,
                deletions: 1,
                patch: PATCH,
              },
              1,
            ),
          ]
        : null,
    );
  },
} as unknown as OnboardingGitHub;

function get(path: string): Promise<Response> | Response {
  return app.request(`/api/projects/${projectId}/pull-requests/reviews/42/commits${path}`);
}

beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github);
  reads = [];
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'tok', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  await app.request(`/api/projects/${projectId}/pull-requests/reviews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      number: 42,
      title: 'Tidy math',
      url: 'https://github.com/acme/shop/pull/42',
      author: 'alice',
      headBranch: 'tidy',
      baseBranch: 'main',
    }),
  });
});

test('the commits of the pull request are listed oldest first', async () => {
  const listed = (await (await get('')).json()) as CommitsResponse;
  expect(listed.commits.map((commit) => commit.title)).toEqual(['Add math', 'Fix math']);
  expect(listed.sinceReview).toBeNull();
});

test("a commit's files are read once, flagged like the whole diff, and served file by file", async () => {
  const diff = (await (await get(`/${FIRST}/diff`)).json()) as CommitDiffResponse;
  expect(diff.files.map((file) => [file.path, file.ignored])).toEqual([
    ['math.js', false],
    ['bun.lock', true],
  ]);
  expect(diff.files[0]).not.toHaveProperty('patch');
  const file = (await (await get(`/${FIRST}/files/1`)).json()) as { patch: string };
  expect(file.patch).toBe(PATCH);
  expect(reads).toEqual([FIRST]);
});

test('a short or unknown commit is refused', async () => {
  expect((await get('/abc1234/diff')).status).toBe(400);
  expect((await get(`/${SECOND}/diff`)).status).toBe(404);
  expect((await get(`/${FIRST}/files/9`)).status).toBe(404);
});
