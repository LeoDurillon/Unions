import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { PullRequestFilter, PullRequestList } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';
import { toPullRequest, type RemotePullRequest } from './github-pull-requests';
import { PULL_REQUEST_CACHE_MS, PullRequestCache } from './routes/pull-request-cache';

function pull(number: number, state: RemotePullRequest['state']): RemotePullRequest {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/shop/pull/${number}`,
    state,
    draft: false,
    author: 'alice',
    headBranch: `branch-${number}`,
    baseBranch: 'main',
    crossRepository: false,
    updatedAt: '2026-10-01T10:00:00Z',
    reviewDecision: null,
    additions: 1,
    deletions: 0,
  };
}

let db: Db;
let app: Hono;
let projectId: number;
let asked: PullRequestFilter[];
let reachable: boolean;

const github = {
  listPullRequests: (_auth: unknown, _repo: unknown, filter: PullRequestFilter) => {
    asked.push(filter);
    const all = [pull(7, 'open'), pull(5, 'merged')];
    const pullRequests =
      filter === 'all'
        ? all
        : all.filter((item) => (filter === 'open') === (item.state === 'open'));
    return Promise.resolve(reachable ? { total: pullRequests.length, pullRequests } : null);
  },
} as unknown as OnboardingGitHub;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github);
  asked = [];
  reachable = true;
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'tok', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

function list(query = ''): Promise<Response> | Response {
  return app.request(`/api/projects/${projectId}/pull-requests${query}`);
}

test('open pull requests by default, each with the ticket it is linked to', async () => {
  const ticket = createTicket(db, { projectId, title: 'Add search' });
  db.update(schema.tickets).set({ prNumber: 7 }).where(eq(schema.tickets.id, ticket.id)).run();

  const body = (await (await list()).json()) as PullRequestList;
  expect(asked).toEqual(['open']);
  expect(body).toMatchObject({ total: 1, pullRequests: [{ number: 7, ticketId: ticket.id }] });

  const all = (await (await list('?state=all')).json()) as PullRequestList;
  expect(all.pullRequests.map((item) => [item.number, item.ticketId])).toEqual([
    [7, ticket.id],
    [5, null],
  ]);
});

test('a bad filter, missing credentials or an unreachable repository are refused', async () => {
  expect((await list('?state=draft')).status).toBe(400);
  reachable = false;
  expect((await list()).status).toBe(404);
  db.update(schema.projects).set({ githubToken: null }).run();
  const previous = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  expect((await list()).status).toBe(409);
  if (previous !== undefined) {
    process.env.GITHUB_TOKEN = previous;
  }
  expect((await app.request('/api/projects/999/pull-requests')).status).toBe(404);
});

test("GitHub's shape maps to ours: merged is its own state, deleted authors are ghosts", () => {
  expect(
    toPullRequest({
      number: 3,
      title: 't',
      url: 'u',
      state: 'MERGED',
      isDraft: true,
      headRefName: 'h',
      baseRefName: 'b',
      isCrossRepository: true,
      updatedAt: 'd',
      reviewDecision: 'APPROVED',
      additions: 2,
      deletions: 1,
      author: null,
    }),
  ).toMatchObject({
    state: 'merged',
    draft: true,
    author: 'ghost',
    headBranch: 'h',
    crossRepository: true,
  });
});

test("GitHub's list is reused a few minutes; Refresh reads it again; ticket links stay current", async () => {
  const first = (await (await list()).json()) as PullRequestList;
  await list();
  expect(asked).toEqual(['open']);

  const ticket = createTicket(db, { projectId, title: 'Add search' });
  db.update(schema.tickets).set({ prNumber: 7 }).where(eq(schema.tickets.id, ticket.id)).run();
  const cached = (await (await list()).json()) as PullRequestList;
  expect(asked).toEqual(['open']);
  expect(cached.fetchedAt).toBe(first.fetchedAt);
  expect(cached.pullRequests[0]?.ticketId).toBe(ticket.id);

  const fresh = (await (await list('?state=open&refresh')).json()) as PullRequestList;
  expect(asked).toEqual(['open', 'open']);
  expect(fresh.fetchedAt).toBeGreaterThanOrEqual(first.fetchedAt);
});

test('the cache expires on its own', async () => {
  let now = 0;
  const cache = new PullRequestCache(() => now);
  const read = (): Promise<{ total: number; pullRequests: [] }> => {
    asked.push('open');
    return Promise.resolve({ total: 0, pullRequests: [] });
  };
  await cache.get(1, 'open', read, false);
  now = PULL_REQUEST_CACHE_MS - 1;
  await cache.get(1, 'open', read, false);
  expect(asked).toHaveLength(1);
  now = PULL_REQUEST_CACHE_MS;
  await cache.get(1, 'open', read, false);
  expect(asked).toHaveLength(2);
});
