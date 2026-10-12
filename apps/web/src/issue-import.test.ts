import { beforeEach, expect, test } from 'bun:test';

import { createDb, getTicket, migrateDb, schema, type Db } from '@union/core';
import type { Hono } from 'hono';

import type { GitHubIssue, IssueImport, TicketSummary } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const ISSUES: Record<number, GitHubIssue> = {
  12: {
    number: 12,
    nodeId: 'I_12',
    title: 'Search is slow',
    body: 'Typing in the search box lags.',
    url: 'https://github.com/acme/shop/issues/12',
    state: 'open',
    pullRequest: false,
  },
  13: {
    number: 13,
    nodeId: 'PR_13',
    title: 'Fix search',
    body: '',
    url: 'https://github.com/acme/shop/pull/13',
    state: 'open',
    pullRequest: true,
  },
};

const github = {
  getIssue: (_auth: unknown, _repo: unknown, number: number) =>
    Promise.resolve(ISSUES[number] ?? null),
} as unknown as OnboardingGitHub;

let db: Db;
let app: Hono;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'tok', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

function post(path: string, issue: string): Promise<Response> | Response {
  return app.request(`/api/tickets/github-issue${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, issue }),
  });
}

test('an issue becomes a ticket on that very issue, once', async () => {
  const preview = (await (await post('/preview', '#12')).json()) as IssueImport;
  expect(preview).toMatchObject({
    number: 12,
    title: 'Search is slow',
    state: 'open',
    ticketId: null,
  });

  const created = await post('', 'https://github.com/acme/shop/issues/12');
  expect(created.status).toBe(201);
  const ticket = getTicket(db, ((await created.json()) as TicketSummary).id);
  expect(ticket).toMatchObject({
    title: 'Search is slow',
    body: 'Typing in the search box lags.',
    issueNumber: 12,
    issueNodeId: 'I_12',
    phase: { kind: 'backlog' },
  });

  const again = (await (await post('/preview', '12')).json()) as IssueImport;
  expect(again.ticketId).toBe(ticket.id);
  expect((await post('', '12')).status).toBe(409);
});

test('pull requests, other repositories, unknown issues and missing credentials are refused', async () => {
  expect((await post('/preview', '13')).status).toBe(400);
  expect((await post('/preview', 'https://github.com/other/shop/issues/12')).status).toBe(400);
  expect((await post('/preview', '99')).status).toBe(404);
  db.update(schema.projects).set({ githubToken: null }).run();
  const previous = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  expect((await post('/preview', '12')).status).toBe(409);
  if (previous !== undefined) {
    process.env.GITHUB_TOKEN = previous;
  }
});
