// A cancel closes the ticket's issue and open pull requests on GitHub, once and only those.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  dispatch,
  getTicket,
  migrateDb,
  schema,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { FakeGitHubApi } from './fake-api';
import { GitHubMirror } from './mirror';

const REPO = { owner: 'o', repo: 'r' };

let db: Db;
let api: FakeGitHubApi;
let sync: GitHubMirror;
let ticketId: number;

function count(call: string): number {
  return api.calls.filter((made) => made === call).length;
}

async function openPull(head: string): Promise<number> {
  const { number } = await api.createPullRequest(REPO, {
    title: head,
    body: '',
    head,
    base: 'main',
  });
  return number;
}

function cancel(): void {
  dispatch(db, ticketId, { type: 'cancel' });
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  sync = new GitHubMirror(db, () => api);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P_1', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'Add search', body: '' }).id;
});

test('a cancel closes the pull request and the issue as not planned, once', async () => {
  await sync.push();
  const number = await openPull('feature');
  db.update(schema.tickets).set({ prNumber: number }).where(eq(schema.tickets.id, ticketId)).run();
  cancel();
  await sync.push();
  expect(api.pulls[0]?.state).toBe('closed');
  expect(api.issueByNumber(1)).toMatchObject({ state: 'closed', closeReason: 'not_planned' });
  expect(getTicket(db, ticketId).githubClosedAt).not.toBeNull();

  await sync.push();
  expect(count('closeIssue')).toBe(1);
  expect(count('closePullRequest')).toBe(1);
});

test('a merged pull request stays merged; the issue still closes', async () => {
  await sync.push();
  const number = await openPull('feature');
  const [pull] = api.pulls;
  if (pull) {
    pull.state = 'merged';
  }
  db.update(schema.tickets).set({ prNumber: number }).where(eq(schema.tickets.id, ticketId)).run();
  cancel();
  await sync.push();
  expect(count('closePullRequest')).toBe(0);
  expect(api.issueByNumber(1).state).toBe('closed');
});

test('nothing closes while a step is stopping, then it does', async () => {
  await sync.push();
  const run = db
    .insert(schema.runs)
    .values({ ticketId, step: 'implement', status: 'running', model: 'test' })
    .returning()
    .get();
  cancel();
  await sync.push();
  expect(api.issueByNumber(1).state).toBeUndefined();
  db.update(schema.runs).set({ status: 'failed' }).where(eq(schema.runs.id, run.id)).run();
  await sync.push();
  expect(api.issueByNumber(1).state).toBe('closed');
});

test('a ticket cancelled before it had an issue opens none', async () => {
  cancel();
  await sync.push();
  expect(count('createIssue')).toBe(0);
});

test('a card the close moved on GitHub is not moved back', async () => {
  await sync.push();
  cancel();
  await sync.push();
  api.issueByNumber(1).status = 'Done';
  await sync.pull();
  expect(
    db
      .select()
      .from(schema.events)
      .all()
      .map((event) => event.type),
  ).not.toContain('github_status_reverted');
});
