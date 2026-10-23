import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, getTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

import { FakeGitHubApi } from './fake-api';
import { refreshPullRequest } from './pull-request';

const REPO = { owner: 'o', repo: 'r' };
const PARENT_BRANCH = 'feature/parent';

let db: Db;
let api: FakeGitHubApi;
let projectId: number;
let ticketId: number;

/** A ticket built on `feature/parent`, whose pull request GitHub moved onto `main`. */
beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Child', body: '' }).id;
  const pull = await api.createPullRequest(REPO, {
    title: 'Child',
    body: '',
    head: 'child',
    base: 'main',
  });
  setTicket(ticketId, {
    prNumber: pull.number,
    prState: 'open',
    phase: { kind: 'done' },
    branch: 'child',
    baseBranch: PARENT_BRANCH,
    chosenBaseBranch: PARENT_BRANCH,
  });
});

function setTicket(id: number, values: Partial<typeof schema.tickets.$inferInsert>): void {
  db.update(schema.tickets).set(values).where(eq(schema.tickets.id, id)).run();
}

async function poll(): Promise<void> {
  await refreshPullRequest(db, api, REPO, getTicket(db, ticketId));
}

function followed(): unknown[] {
  return db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type === 'base_followed')
    .map((event) => event.payload);
}

/** Every call that would change something on GitHub. */
function writes(): string[] {
  return api.calls.filter((call) => /^(?:create|update|set|add|remove|mark|close)/u.test(call));
}

async function mergedParentPull(): Promise<number> {
  const merged = await api.createPullRequest(REPO, {
    title: 'Parent',
    body: '',
    head: PARENT_BRANCH,
    base: 'main',
  });
  const stored = api.pullByNumber(merged.number);
  stored.state = 'merged';
  return merged.number;
}

test('the ticket takes the base GitHub moved its pull request onto, and keeps the one it left', async () => {
  const merged = await mergedParentPull();
  const before = writes().length;
  await poll();
  expect(getTicket(db, ticketId)).toMatchObject({
    baseBranch: 'main',
    chosenBaseBranch: 'main',
    leftBase: { branch: PARENT_BRANCH, prNumber: merged },
  });
  expect(followed()).toEqual([
    { from: PARENT_BRANCH, to: 'main', prNumber: merged, reason: 'merged' },
  ]);
  expect(writes()).toHaveLength(before);
  await poll();
  expect(followed()).toHaveLength(1);
});

test('a base edited on GitHub, with no merged pull request, is followed too', async () => {
  await poll();
  expect(getTicket(db, ticketId).leftBase).toEqual({ branch: PARENT_BRANCH, prNumber: null });
  expect(followed()).toEqual([
    { from: PARENT_BRANCH, to: 'main', prNumber: null, reason: 'edited' },
  ]);
});

test("a parent ticket's merged pull request is known without asking GitHub", async () => {
  const parentId = createTicket(db, { projectId, title: 'Parent', body: '' }).id;
  setTicket(parentId, { branch: PARENT_BRANCH, prNumber: 42, prState: 'merged' });
  setTicket(ticketId, { parentTicketId: parentId });
  await poll();
  expect(getTicket(db, ticketId).leftBase).toEqual({ branch: PARENT_BRANCH, prNumber: 42 });
  expect(api.calls).not.toContain('mergedPullRequest');
});

test('nothing is followed while a step runs', async () => {
  setTicket(ticketId, { phase: { kind: 'running', step: 'rebase' } });
  await poll();
  expect(getTicket(db, ticketId)).toMatchObject({ baseBranch: PARENT_BRANCH, leftBase: null });
  expect(followed()).toEqual([]);
});

test('a second move keeps the base first left: its commits are still the ones to leave', async () => {
  await poll();
  api.pullByNumber(getTicket(db, ticketId).prNumber ?? 0).base = 'release';
  await poll();
  expect(getTicket(db, ticketId)).toMatchObject({
    baseBranch: 'release',
    leftBase: { branch: PARENT_BRANCH, prNumber: null },
  });
});
