import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  migrateDb,
  schema,
  setParent,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { FakeGitHubApi } from './fake-api';
import { GitHubMirror } from './mirror';

let db: Db;
let api: FakeGitHubApi;
let sync: GitHubMirror;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  sync = new GitHubMirror(db, () => api);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P_1', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
});

function addTicket(title: string): number {
  return createTicket(db, { projectId, title }).id;
}

test('the parent is mirrored as "blocked by" once, and removed when unlinked', async () => {
  const parent = addTicket('Search index');
  const child = addTicket('Search filters');
  setParent(db, child, parent);
  await sync.push();
  expect(api.issueByNumber(2).blockedBy).toEqual([1]);
  expect(getTicket(db, child).githubBlockedBy).toBe(1);

  await sync.push();
  expect(api.calls.filter((call) => call === 'addBlockedBy')).toHaveLength(1);

  setParent(db, child, null);
  await sync.push();
  expect(api.issueByNumber(2).blockedBy).toEqual([]);
  expect(getTicket(db, child).githubBlockedBy).toBeNull();
});

test('a parent created after the child is mirrored once its issue exists', async () => {
  const child = addTicket('Search filters');
  const parent = addTicket('Search index');
  setParent(db, child, parent);
  await sync.push();
  // The child (issue #1) was pushed before its parent had an issue.
  expect(api.issueByNumber(1).blockedBy).toEqual([]);
  await sync.push();
  expect(api.issueByNumber(1).blockedBy).toEqual([2]);
});

test('changing the parent swaps the relation; one already on GitHub is not added twice', async () => {
  const first = addTicket('first');
  const second = addTicket('second');
  const child = addTicket('child');
  setParent(db, child, first);
  await sync.push();
  setParent(db, child, second);
  api.issueByNumber(3).blockedBy.push(2);
  await sync.push();
  expect(api.issueByNumber(3).blockedBy).toEqual([2]);
  expect(eventsOf('github_sync_error')).toHaveLength(0);
});

test('a deleted parent removes the relation', async () => {
  const parent = addTicket('parent');
  const child = addTicket('child');
  setParent(db, child, parent);
  await sync.push();
  db.delete(schema.tickets).where(eq(schema.tickets.id, parent)).run();
  await sync.push();
  expect(api.issueByNumber(2).blockedBy).toEqual([]);
});

function eventsOf(type: string): unknown[] {
  return db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type === type);
}
