// The sync's optional layers: issues without a GitHub Project, and neither, with the PR side untouched.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  dispatch,
  getTicket,
  migrateDb,
  saveOutput,
  schema,
  type Db,
  type ProjectConfig,
} from '@union/core';

import { FakeGitHubApi } from './fake-api';
import { GitHubMirror } from './mirror';

const BOARD_CALLS = new Set([
  'resolveProject',
  'getProjectInfo',
  'addToProject',
  'setStatus',
  'listProjectItems',
]);

let db: Db;
let api: FakeGitHubApi;
let sync: GitHubMirror;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  api = new FakeGitHubApi();
  sync = new GitHubMirror(db, () => api);
});

function projectWith(config: Partial<ProjectConfig>): number {
  return db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main', ...config } })
    .returning()
    .get().id;
}

function withIntakeOutput(ticketId: number): void {
  dispatch(db, ticketId, { type: 'start' });
  saveOutput(db, ticketId, 'intake', 'draft');
  dispatch(db, ticketId, { type: 'run_finished' });
}

function syncErrors(): number {
  return db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type === 'github_sync_error').length;
}

test('issues and no Project: the issue and its step comments, no board call, no error', async () => {
  const ticketId = createTicket(db, { projectId: projectWith({}), title: 'Add search' }).id;
  withIntakeOutput(ticketId);
  await sync.push();
  await sync.pull();
  expect(getTicket(db, ticketId)).toMatchObject({ issueNumber: 1, projectItemId: null });
  expect(api.issueByNumber(1).comments).toHaveLength(1);
  expect(api.calls.filter((call) => BOARD_CALLS.has(call))).toEqual([]);
  expect(syncErrors()).toBe(0);
});

test('neither issues nor a Project: no GitHub write for the ticket, no error', async () => {
  const ticketId = createTicket(db, {
    projectId: projectWith({ mirrorIssues: false }),
    title: 'Add search',
  }).id;
  withIntakeOutput(ticketId);
  await sync.push();
  await sync.pull();
  expect(getTicket(db, ticketId).issueNumber).toBeNull();
  expect(api.issues).toHaveLength(0);
  expect(api.calls).not.toContain('createComment');
  expect(api.calls.filter((call) => BOARD_CALLS.has(call))).toEqual([]);
  expect(syncErrors()).toBe(0);
});

test('a ticket imported from a GitHub issue keeps it and gets its comments with mirroring off', async () => {
  const ticketId = createTicket(db, {
    projectId: projectWith({ mirrorIssues: false }),
    title: 'Imported',
    issue: { number: 1, nodeId: 'I_1' },
  }).id;
  await api.createIssue({ owner: 'o', repo: 'r' }, { title: 'Imported', body: '' });
  withIntakeOutput(ticketId);
  await sync.push();
  expect(api.issues).toHaveLength(1);
  expect(api.issueByNumber(1).comments).toHaveLength(1);
});

test('a Project needs issues: with one connected, mirroring off still opens them', async () => {
  const projectId = projectWith({ mirrorIssues: false });
  db.update(schema.projects).set({ githubProjectNodeId: 'P_1' }).run();
  const ticketId = createTicket(db, { projectId, title: 'Add search' }).id;
  await sync.push();
  expect(getTicket(db, ticketId)).toMatchObject({ issueNumber: 1, projectItemId: 'item_I_1' });
});

test('turning mirroring back on opens the missing issues on the next push', async () => {
  const projectId = projectWith({ mirrorIssues: false });
  const ticketId = createTicket(db, { projectId, title: 'Add search' }).id;
  await sync.push();
  expect(getTicket(db, ticketId).issueNumber).toBeNull();
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main', mirrorIssues: true } })
    .run();
  await sync.push();
  expect(getTicket(db, ticketId).issueNumber).toBe(1);
});

test('a cancelled ticket without an issue still has its open pull request closed', async () => {
  const projectId = projectWith({ mirrorIssues: false });
  const ticketId = createTicket(db, { projectId, title: 'Add search' }).id;
  const pr = await api.createPullRequest(
    { owner: 'o', repo: 'r' },
    { title: 't', body: '', head: 'union-1-add-search', base: 'main' },
  );
  db.update(schema.tickets).set({ prNumber: pr.number }).run();
  dispatch(db, ticketId, { type: 'cancel' });
  await sync.push();
  expect(api.calls).toContain('closePullRequest');
  expect(api.calls).not.toContain('createIssue');
  expect(api.calls).not.toContain('closeIssue');
});

test('a GitHub Project URL that cannot be read is reported; its issues are still opened', async () => {
  const projectId = projectWith({});
  db.update(schema.projects).set({ githubProjectUrl: 'not-a-url' }).run();
  const ticketId = createTicket(db, { projectId, title: 'Fix' }).id;
  await sync.push();
  expect(syncErrors()).toBe(1);
  const { issueNumber, projectItemId } = getTicket(db, ticketId);
  expect(issueNumber).toBe(1);
  expect(projectItemId).toBeNull();
});
