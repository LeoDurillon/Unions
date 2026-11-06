// Tests noticing, at the pull request poll, that the ticket's branch moved on GitHub away from Union's last push.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, getTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

import { FakeGitHubApi } from './fake-api';
import { refreshPullRequest } from './pull-request';

const REPO = { owner: 'o', repo: 'r' };

let db: Db;
let api: FakeGitHubApi;
let ticketId: number;

function setHead(sha: string): void {
  const pull = api.pulls.at(0);
  if (pull) {
    pull.headSha = sha;
  }
}

function poll(): Promise<void> {
  return refreshPullRequest(db, api, REPO, getTicket(db, ticketId));
}

beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'Add search' }).id;
  const pull = await api.createPullRequest(REPO, {
    title: 'Add search',
    body: '',
    head: 'feature',
    base: 'main',
  });
  db.update(schema.tickets)
    .set({ prNumber: pull.number, branch: 'feature', phase: { kind: 'done' }, pushedSha: 'aaa' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  setHead('aaa');
});

test('the head Union pushed is no move', async () => {
  await poll();
  expect(getTicket(db, ticketId).remoteMoved).toBeNull();
  expect(api.calls).not.toContain('compareCommits');
});

test('a rewrite is flagged once, and asked about once', async () => {
  setHead('bbb');
  api.comparisons.set('aaa...bbb', 'diverged');
  await poll();
  await poll();
  expect(getTicket(db, ticketId).remoteMoved).toEqual({ from: 'aaa', to: 'bbb', kind: 'diverged' });
  expect(api.calls.filter((call) => call === 'compareCommits')).toHaveLength(1);
});

test('commits added on top are a move ahead; the head coming back clears it', async () => {
  setHead('bbb');
  await poll();
  expect(getTicket(db, ticketId).remoteMoved?.kind).toBe('ahead');
  setHead('aaa');
  await poll();
  expect(getTicket(db, ticketId).remoteMoved).toBeNull();
});

test('a head behind the push waits a poll: GitHub may not have caught up with it', async () => {
  setHead('old');
  api.comparisons.set('aaa...old', 'behind');
  await poll();
  expect(getTicket(db, ticketId).remoteMoved).toBeNull();
  await poll();
  expect(getTicket(db, ticketId).remoteMoved?.kind).toBe('diverged');
});

test('nothing is compared while a step works on the branch', async () => {
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'rebase' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  setHead('bbb');
  await poll();
  expect(getTicket(db, ticketId).remoteMoved).toBeNull();
  expect(api.calls).not.toContain('compareCommits');
});
