import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, getTicket, migrateDb, schema, type Db } from '@union/core';

import { FakeGitHubApi } from './fake-api';
import { refreshPullRequest } from './pull-request';

const REPO = { owner: 'o', repo: 'r' };

let db: Db;
let api: FakeGitHubApi;
let ticketId: number;

beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'Add search', body: '' }).id;
  const pull = await api.createPullRequest(REPO, {
    title: 'Add search',
    body: '',
    head: 'feature',
    base: 'main',
  });
  db.update(schema.tickets).set({ prNumber: pull.number }).run();
  const [stored] = api.pulls;
  if (stored) {
    stored.headSha = 'aaa';
  }
});

async function poll(): Promise<void> {
  await refreshPullRequest(db, api, REPO, getTicket(db, ticketId));
}

function failures(): unknown[] {
  return db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type === 'pull_request_checks_failed')
    .map((event) => event.payload);
}

function head(sha: string): void {
  const [pull] = api.pulls;
  if (pull) {
    pull.headSha = sha;
  }
}

test('the checks of the head are kept, and turning red is logged once', async () => {
  api.checks.set('aaa', 'pending');
  await poll();
  expect(getTicket(db, ticketId)).toMatchObject({ prChecksState: 'pending', prChecksSha: 'aaa' });
  api.checks.set('aaa', 'failure');
  await poll();
  await poll();
  expect(failures()).toEqual([{ number: 1, sha: 'aaa' }]);
});

test('the first read says nothing, a new head that fails does', async () => {
  api.checks.set('aaa', 'failure');
  await poll();
  expect(failures()).toEqual([]);
  head('bbb');
  api.checks.set('bbb', 'failure');
  await poll();
  expect(failures()).toEqual([{ number: 1, sha: 'bbb' }]);
});

test('a re-run that fails again is logged again', async () => {
  api.checks.set('aaa', 'success');
  await poll();
  api.checks.set('aaa', 'failure');
  await poll();
  api.checks.set('aaa', 'pending');
  await poll();
  api.checks.set('aaa', 'failure');
  await poll();
  expect(failures()).toHaveLength(2);
});

test('checks that cannot be read, and a pull request no longer open, are cleared', async () => {
  await poll();
  expect(getTicket(db, ticketId)).toMatchObject({ prChecksState: null, prChecksSha: 'aaa' });
  api.checks.set('aaa', 'failure');
  await poll();
  expect(failures()).toHaveLength(1);
  const [pull] = api.pulls;
  if (pull) {
    pull.state = 'closed';
  }
  await poll();
  expect(getTicket(db, ticketId)).toMatchObject({ prChecksState: null, prChecksSha: null });
  expect(api.calls.filter((call) => call === 'pullRequestChecks')).toHaveLength(2);
});
