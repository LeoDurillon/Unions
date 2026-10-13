import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, getTicket, migrateDb, schema, type Db } from '@union/core';

import { FakeGitHubApi } from './fake-api';
import { refreshPullRequest } from './pull-request';

const REPO = { owner: 'o', repo: 'r' };
const MERGED_AT = 1_700_000_000_000;

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
  db.update(schema.tickets)
    .set({ prNumber: pull.number, phase: { kind: 'done' } })
    .run();
  const stored = api.pulls.find((candidate) => candidate.number === pull.number);
  if (stored) {
    stored.state = 'merged';
    stored.mergedAt = MERGED_AT;
  }
});

function polls(): number {
  return api.calls.filter((call) => call.startsWith('pullRequestStatus')).length;
}

test('a merge keeps its date, and the pull request is not asked about again', async () => {
  await refreshPullRequest(db, api, REPO, getTicket(db, ticketId));
  expect(getTicket(db, ticketId)).toMatchObject({ prState: 'merged', prMergedAt: MERGED_AT });
  await refreshPullRequest(db, api, REPO, getTicket(db, ticketId));
  expect(polls()).toBe(1);
});

test('a pull request merged before the date was kept is asked once more, for it', async () => {
  db.update(schema.tickets).set({ prState: 'merged', prMergedAt: null }).run();
  await refreshPullRequest(db, api, REPO, getTicket(db, ticketId));
  expect(getTicket(db, ticketId).prMergedAt).toBe(MERGED_AT);
  await refreshPullRequest(db, api, REPO, getTicket(db, ticketId));
  expect(polls()).toBe(1);
});
