// Tests for importing a pull request as a ticket, against a fake GitHub.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, getTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import type { PullRequestImport, PullRequestSource, TicketSummary } from './api-types';
import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const SUMMARY = '<!-- union:ticket=4 step=summary -->\n### Summary · v2 · approved\n\nThe summary.';
const IMPLEMENT =
  '<!-- union:ticket=4 step=implement -->\n### Implementation · v1 · approved\n\nDone.';

function pull(number: number, overrides: Partial<PullRequestSource> = {}): PullRequestSource {
  return {
    number,
    title: `PR ${number}`,
    body: 'What the PR does.',
    url: `https://github.com/acme/shop/pull/${number}`,
    state: 'open',
    draft: false,
    headBranch: `${number}-fix`,
    baseBranch: 'develop',
    headSha: 'abc123',
    fromFork: false,
    issues: [],
    ...overrides,
  };
}

const ISSUE = {
  number: 12,
  nodeId: 'I_12',
  title: 'Search is slow',
  body: 'Typing lags.\n\n<!-- union:ticket=4 -->',
  url: 'https://github.com/acme/shop/issues/12',
  comments: [
    { id: '100', body: SUMMARY },
    { id: '101', body: 'Thanks!' },
    { id: '102', body: IMPLEMENT },
  ],
};

const PULLS: Record<number, PullRequestSource> = {
  20: pull(20, { issues: [ISSUE] }),
  21: pull(21, { draft: true }),
  22: pull(22, { fromFork: true }),
  23: pull(23, { state: 'merged' }),
};

const github = {
  getPullRequestSource: (_auth: unknown, _repo: unknown, number: number) =>
    Promise.resolve(PULLS[number] ?? null),
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

function post(path: string, pullRequest: string): Promise<Response> | Response {
  return app.request(`/api/tickets/github-pull-request${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, pullRequest }),
  });
}

function outputsOf(ticketId: number): { step: string; version: number; validation: string }[] {
  return db
    .select()
    .from(schema.stepOutputs)
    .where(eq(schema.stepOutputs.ticketId, ticketId))
    .orderBy(schema.stepOutputs.id)
    .all()
    .map(({ step, version, validation }) => ({ step, version, validation }));
}

test('a pull request closing an issue Union worked on: its steps prefilled, on the issue', async () => {
  const preview = (await (await post('/preview', '#20')).json()) as PullRequestImport;
  expect(preview.issue?.number).toBe(12);
  expect(preview.steps).toEqual([{ step: 'summary', version: 2, validation: 'approved' }]);
  expect(preview.flow).toEqual(['summary', 'implement', 'final_review']);
  expect(preview.refusal).toBeNull();

  const created = await post('', 'https://github.com/acme/shop/pull/20');
  expect(created.status).toBe(201);
  const ticket = getTicket(db, ((await created.json()) as TicketSummary).id);
  expect(ticket).toMatchObject({
    title: 'Search is slow',
    body: 'Typing lags.',
    issueNumber: 12,
    branch: '20-fix',
    chosenBaseBranch: 'develop',
    prNumber: 20,
    pushedSha: 'abc123',
    flow: ['summary', 'implement', 'final_review'],
    phase: { kind: 'backlog' },
  });
  expect(ticket.prReadyAt).not.toBeNull();
  expect(outputsOf(ticket.id)).toEqual([
    { step: 'summary', version: 2, validation: 'approved' },
    { step: 'implement', version: 1, validation: 'pending' },
  ]);
  const comments = db.select().from(schema.stepOutputs).orderBy(schema.stepOutputs.id).all();
  expect(comments.map((output) => output.githubCommentId)).toEqual(['100', '102']);
  const command = db.select().from(schema.commands).get();
  expect(command).toMatchObject({ type: 'adopt_pull_request', ticketId: ticket.id });

  const again = (await (await post('/preview', '20')).json()) as PullRequestImport;
  expect(again.ticketId).toBe(ticket.id);
  expect((await post('', '20')).status).toBe(409);
});

test('a pull request with no issue: the Quick flow, its own title and description', async () => {
  const created = await post('', '21');
  const ticket = getTicket(db, ((await created.json()) as TicketSummary).id);
  expect(ticket).toMatchObject({
    title: 'PR 21',
    body: 'What the PR does.',
    issueNumber: null,
    flow: ['implement', 'final_review'],
    prReadyAt: null,
  });
  expect(outputsOf(ticket.id)).toEqual([{ step: 'implement', version: 1, validation: 'pending' }]);
});

test('forks, merged and unknown pull requests are refused', async () => {
  const fork = (await (await post('/preview', '22')).json()) as PullRequestImport;
  expect(fork.refusal).toContain('fork');
  expect((await post('', '22')).status).toBe(409);
  expect((await post('', '23')).status).toBe(409);
  expect((await post('/preview', '99')).status).toBe(404);
  expect(db.select().from(schema.tickets).all()).toHaveLength(0);
});
