// Title and description edits read from the repository's issues when the project has no GitHub Project.
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

import { FakeGitHubApi } from './fake-api';
import { GitHubMirror } from './mirror';

let db: Db;
let api: FakeGitHubApi;
let sync: GitHubMirror;
let ticketId: number;

beforeEach(async () => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  sync = new GitHubMirror(db, () => api);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'Add search', body: 'Details' }).id;
  await sync.push();
});

test('an edit on GitHub reaches the ticket without a board, ignoring our marker', async () => {
  api.editRemote(1, { title: 'Add fuzzy search', body: 'New details\n\n<!-- union:ticket=1 -->' });
  await sync.pull();
  expect(getTicket(db, ticketId)).toMatchObject({ title: 'Add fuzzy search', body: 'New details' });
  expect(api.calls).not.toContain('listProjectItems');

  api.editRemote(1, { title: 'Add search, again' });
  await sync.pull();
  expect(getTicket(db, ticketId).title).toBe('Add search, again');
});

test('an issue read before an edit from Union does not undo it', async () => {
  await sync.pull();
  const read = getTicket(db, ticketId).githubUpdatedAt;
  expect(read).not.toBeNull();
  // Union saved an edit later than GitHub's copy of the issue.
  db.update(schema.tickets)
    .set({ title: 'Edited in Union', githubUpdatedAt: new Date(Date.now()).toISOString() })
    .run();
  await sync.pull();
  expect(getTicket(db, ticketId).title).toBe('Edited in Union');
});

test('the first pull lists every issue, later ones only those updated since the last', async () => {
  await sync.pull();
  const first = getTicket(db, ticketId).githubUpdatedAt;
  api.editRemote(1, { title: 'Renamed' });
  await sync.pull();
  expect(api.issueListings).toEqual([null, first]);
  expect(getTicket(db, ticketId).title).toBe('Renamed');
  // After a restart, the cursor starts from the oldest ticket's last read.
  const restarted = new GitHubMirror(db, () => api);
  await restarted.pull();
  expect(api.issueListings.at(-1)).toBe(getTicket(db, ticketId).githubUpdatedAt);
});

test('done and cancelled tickets are not listed', async () => {
  dispatch(db, ticketId, { type: 'cancel' });
  await sync.pull();
  expect(api.issueListings).toEqual([]);
});
