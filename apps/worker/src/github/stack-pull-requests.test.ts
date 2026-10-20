import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  listSlices,
  migrateDb,
  replaceSlices,
  schema,
  type Db,
} from '@union/core';

import { FakeGitHubApi } from './fake-api';
import { refreshPullRequest } from './pull-request';

const REPO = { owner: 'o', repo: 'r' };

let db: Db;
let api: FakeGitHubApi;
let ticketId: number;
let issue: number;
let lower: number;
let top: number;

beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'Invoices', body: '' }).id;
  issue = (await api.createIssue(REPO, { title: 'Invoices', body: '' })).number;
  top = (
    await api.createPullRequest(REPO, {
      title: 'CRUD',
      body: '',
      head: 'feature',
      base: 'feature-s1',
    })
  ).number;
  lower = (
    await api.createPullRequest(REPO, {
      title: 'Table',
      body: '',
      head: 'feature-s1',
      base: 'main',
    })
  ).number;
  db.update(schema.tickets)
    .set({
      prNumber: top,
      prState: 'open',
      issueNumber: issue,
      branch: 'feature',
      phase: { kind: 'done' },
    })
    .run();
  replaceSlices(db, ticketId, [
    {
      position: 1,
      title: 'Table',
      spec: 't',
      tipSha: 'a1',
      branch: 'feature-s1',
      prNumber: lower,
      prState: 'open',
    },
    {
      position: 2,
      title: 'CRUD',
      spec: 'c',
      tipSha: 'b1',
      branch: 'feature',
      prNumber: top,
      prState: 'open',
    },
  ]);
});

function merge(number: number, into: string): void {
  const pull = api.pullByNumber(number);
  pull.state = 'merged';
  pull.mergedAt = 1;
  pull.base = into;
  pull.headSha = `tip-${number}`;
}

const poll = (): Promise<void> => refreshPullRequest(db, api, REPO, getTicket(db, ticketId));

test('the bottom slice merged: the ticket stays open, the slice records where, a restack starts', async () => {
  merge(lower, 'main');
  await poll();
  expect(getTicket(db, ticketId)).toMatchObject({ prState: 'open' });
  expect(listSlices(db, ticketId)[0]).toMatchObject({
    prState: 'merged',
    mergedInto: 'main',
    mergedTipSha: `tip-${lower}`,
  });
  expect(getTicket(db, ticketId).phase).toEqual({
    kind: 'running',
    step: 'restack',
    thenRun: 'final_review',
    thenDone: true,
    hostOnly: true,
  });
  expect(api.calls).not.toContain('closeIssue');
});

test('the top slice merged first, into the slice below: not merged, no restack, no merge event', async () => {
  merge(top, 'feature-s1');
  await poll();
  expect(getTicket(db, ticketId)).toMatchObject({ prState: 'open', phase: { kind: 'done' } });
  const events = db
    .select()
    .from(schema.events)
    .all()
    .map((event) => event.type);
  expect(events).not.toContain('pull_request_merged');
  expect(events).toContain('stack_slice_status');
});

test('every slice merged into the base: the ticket is merged and its issue closed', async () => {
  merge(lower, 'main');
  await poll();
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .run();
  merge(top, 'main');
  await poll();
  expect(getTicket(db, ticketId)).toMatchObject({ prState: 'merged', prMergedAt: 1 });
  expect(api.calls).toContain('closeIssue');
  const events = db
    .select()
    .from(schema.events)
    .all()
    .map((event) => event.type);
  expect(events).toContain('pull_request_merged');
});

test('on a GitHub stack, Union waits for GitHub to retarget the next pull request, then follows', async () => {
  api.stacks?.set(1, [lower, top]);
  db.update(schema.tickets).set({ githubStackNumber: 1 }).run();
  merge(lower, 'main');
  await poll();
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'done' });
  expect(api.calls.filter((call) => call === 'pullRequestStack')).toHaveLength(1);
  api.pullByNumber(top).base = 'main';
  await poll();
  expect(getTicket(db, ticketId).phase).toMatchObject({ step: 'restack', hostOnly: true });
});

test('a GitHub stack dissolved by hand is forgotten: Union restacks on its own after a merge', async () => {
  db.update(schema.tickets).set({ githubStackNumber: 1 }).run();
  merge(lower, 'main');
  await poll();
  expect(getTicket(db, ticketId).githubStackNumber).toBeNull();
  expect(getTicket(db, ticketId).phase).toMatchObject({ step: 'restack', hostOnly: true });
});
