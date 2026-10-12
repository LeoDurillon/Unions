import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, getTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { PullRequestInfo } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const PULLS: Record<number, PullRequestInfo> = {
  7: {
    number: 7,
    url: 'https://github.com/acme/shop/pull/7',
    headBranch: '3-add-search',
    draft: true,
    state: 'open',
    merged: false,
  },
  8: {
    number: 8,
    url: 'https://github.com/acme/shop/pull/8',
    headBranch: 'my-branch',
    draft: false,
    state: 'open',
    merged: false,
  },
  9: {
    number: 9,
    url: 'https://github.com/acme/shop/pull/9',
    headBranch: 'old',
    draft: false,
    state: 'closed',
    merged: false,
  },
};

const github: OnboardingGitHub = {
  verify: () => Promise.reject(new Error('unused')),
  listRepos: () => Promise.reject(new Error('unused')),
  listProjects: () => Promise.reject(new Error('unused')),
  createProject: () => Promise.reject(new Error('unused')),
  getPullRequest: (_auth, _repo, number) => Promise.resolve(PULLS[number] ?? null),
  getDiscussion: () => Promise.resolve(null),
  listPullRequests: () => Promise.resolve(null),
  getPullRequestFiles: () => Promise.resolve(null),
  getIssue: () => Promise.resolve(null),
  verifyApp: () => Promise.reject(new Error('unused')),
  listInstallations: () => Promise.reject(new Error('unused')),
};

let db: Db;
let app: Hono;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github);
  const project = db
    .insert(schema.projects)
    .values({
      owner: 'acme',
      repo: 'shop',
      githubProjectNodeId: 'P',
      githubToken: 'tok',
      config: { baseBranch: 'main' },
    })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'Add search' }).id;
  db.update(schema.tickets)
    .set({ branch: '3-add-search' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
});

function link(value: string): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/pull-request`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pullRequest: value }),
  });
}

test('linking by URL stores the number; a draft stays to be marked ready at the end', async () => {
  const response = await link('https://github.com/acme/shop/pull/7');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ number: 7, warning: null });
  expect(getTicket(db, ticketId)).toMatchObject({ prNumber: 7, prReadyAt: null });
});

test('a pull request from another branch links with a warning; a ready one is not marked again', async () => {
  const body = (await (await link('#8')).json()) as { warning: string | null };
  expect(body.warning).toContain('"my-branch"');
  expect(getTicket(db, ticketId).prNumber).toBe(8);
  expect(getTicket(db, ticketId).prReadyAt).not.toBeNull();
});

test('missing, closed, malformed and foreign references are refused without linking', async () => {
  expect((await link('99')).status).toBe(404);
  expect((await link('9')).status).toBe(409);
  expect((await link('nope')).status).toBe(400);
  expect((await link('https://github.com/acme/other/pull/7')).status).toBe(400);
  expect(getTicket(db, ticketId).prNumber).toBeNull();
});

test('without a GitHub token the link is refused', async () => {
  db.update(schema.projects).set({ githubToken: null }).run();
  const previous = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  expect((await link('7')).status).toBe(409);
  process.env.GITHUB_TOKEN = previous;
});

test('unlinking forgets the pull request locally', async () => {
  await link('7');
  const response = await app.request(`/api/tickets/${ticketId}/pull-request`, { method: 'DELETE' });
  expect(response.status).toBe(200);
  expect(getTicket(db, ticketId)).toMatchObject({ prNumber: null, prReadyAt: null });
});
