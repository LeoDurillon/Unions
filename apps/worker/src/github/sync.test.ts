import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  dispatch,
  getTicket,
  migrateDb,
  recordValidation,
  saveOutput,
  schema,
  setParent,
  type Db,
} from '@union/core';

import { FakeGitHubApi } from './fake-api';
import { GitHubMirror } from './mirror';

let db: Db;
let api: FakeGitHubApi;
let sync: GitHubMirror;
let ticketId: number;

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
  ticketId = createTicket(db, { projectId: project.id, title: 'Add search', body: 'Details' }).id;
});

function eventTypes(): string[] {
  return db
    .select()
    .from(schema.events)
    .all()
    .map((event) => event.type);
}

test('a new ticket becomes an issue in the project with the backlog status, once', async () => {
  await sync.push();
  const ticket = getTicket(db, ticketId);
  expect(ticket).toMatchObject({ issueNumber: 1, githubSyncedStatus: 'backlog' });
  expect(ticket.projectItemId).toBe('item_I_1');
  expect(api.issueByNumber(1).body).toContain(`<!-- union:ticket=${ticketId} -->`);
  expect(api.issueByNumber(1).status).toBe('Todo');

  const before = api.calls.length;
  await sync.push();
  expect(api.calls).toHaveLength(before);
});

test('phase changes move the card; in_review falls back to In Progress', async () => {
  await sync.push();
  dispatch(db, ticketId, { type: 'start' });
  await sync.push();
  expect(api.issueByNumber(1).status).toBe('In Progress');

  db.update(schema.tickets)
    .set({ phase: { kind: 'awaiting_approval', step: 'final_review' } })
    .run();
  await sync.push();
  expect(api.issueByNumber(1).status).toBe('In Progress');
  expect(getTicket(db, ticketId).githubSyncedStatus).toBe('in_review');
});

test('one comment per step: edited on new versions, approval and feedback', async () => {
  await sync.push();
  dispatch(db, ticketId, { type: 'start' });
  saveOutput(db, ticketId, 'intake', 'first draft');
  dispatch(db, ticketId, { type: 'run_finished' });
  await sync.push();
  expect(api.issueByNumber(1).comments).toHaveLength(1);
  expect(api.issueByNumber(1).comments[0]?.body).toContain('Intake · v1 · awaiting review');

  recordValidation(db, ticketId, { status: 'revise', feedback: 'shorter please' });
  dispatch(db, ticketId, { type: 'revise' });
  saveOutput(db, ticketId, 'intake', 'second draft');
  dispatch(db, ticketId, { type: 'run_finished' });
  await sync.push();
  const [comment] = api.issueByNumber(1).comments;
  expect(api.issueByNumber(1).comments).toHaveLength(1);
  expect(comment?.body).toContain('second draft');
  expect(comment?.body).toContain('**v1:** shorter please');

  recordValidation(db, ticketId, { status: 'approved' });
  await sync.push();
  expect(api.issueByNumber(1).comments[0]?.body).toContain('v2 · approved');
  expect(api.calls.filter((call) => call === 'createComment')).toHaveLength(1);
});

test('a comment posted before a DB reset is found by its marker, not duplicated', async () => {
  await sync.push();
  dispatch(db, ticketId, { type: 'start' });
  saveOutput(db, ticketId, 'intake', 'draft');
  dispatch(db, ticketId, { type: 'run_finished' });
  await sync.push();
  db.update(schema.stepOutputs).set({ githubCommentId: null, githubBodyHash: null }).run();
  await sync.push();
  expect(api.issueByNumber(1).comments).toHaveLength(1);
  expect(api.calls.filter((call) => call === 'createComment')).toHaveLength(1);
});

test('title and description edited on GitHub win locally, ignoring our marker', async () => {
  await sync.push();
  await sync.pull();
  expect(getTicket(db, ticketId)).toMatchObject({ title: 'Add search', body: 'Details' });

  api.editRemote(1, { title: 'Add fuzzy search', body: 'New details\n\n<!-- union:ticket=1 -->' });
  await sync.pull();
  expect(getTicket(db, ticketId)).toMatchObject({ title: 'Add fuzzy search', body: 'New details' });
  expect(eventTypes()).toContain('ticket_updated_from_github');
});

test('moving the card to In Progress on GitHub starts the ticket once', async () => {
  await sync.push();
  await sync.pull();
  api.editRemote(1, { status: 'In Progress' });
  await sync.pull();
  await sync.pull();
  const starts = db.select().from(schema.commands).all();
  expect(starts).toHaveLength(1);
  expect(starts[0]).toMatchObject({ type: 'start', ticketId });
});

test('a start requested from GitHub is not reverted while the command is pending', async () => {
  await sync.push();
  await sync.pull();
  api.editRemote(1, { status: 'In Progress' });
  await sync.pull();
  await sync.push();
  expect(api.issueByNumber(1).status).toBe('In Progress');
});

test('other remote moves are reverted to the local status', async () => {
  await sync.push();
  await sync.pull();
  api.editRemote(1, { status: 'Done' });
  await sync.pull();
  expect(eventTypes()).toContain('github_status_reverted');
  await sync.push();
  expect(api.issueByNumber(1).status).toBe('Todo');
});

test('a child moved to In Progress on GitHub before its parent is done is reverted', async () => {
  const { projectId } = getTicket(db, ticketId);
  const child = createTicket(db, { projectId, title: 'Search filters' }).id;
  setParent(db, child, ticketId);
  await sync.push();
  await sync.pull();
  api.editRemote(2, { status: 'In Progress' });
  await sync.pull();
  expect(db.select().from(schema.commands).all()).toHaveLength(0);
  expect(eventTypes()).toContain('start_blocked');
  await sync.push();
  expect(api.issueByNumber(2).status).toBe('Todo');
});

test('API failures are reported once per distinct error and do not throw', async () => {
  api.createIssue = () => Promise.reject(new Error('Bad credentials'));
  await sync.push();
  await sync.push();
  const errors = db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type === 'github_sync_error');
  expect(errors).toHaveLength(1);
  expect(getTicket(db, ticketId).issueNumber).toBeNull();
});

test('a project created from a URL gets its node id resolved before syncing', async () => {
  const project = db
    .insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'r2',
      githubProjectUrl: 'https://github.com/orgs/o/projects/7',
      config: { baseBranch: 'main' },
    })
    .returning()
    .get();
  await sync.push();
  const row = db
    .select()
    .from(schema.projects)
    .all()
    .find((candidate) => candidate.id === project.id);
  expect(row?.githubProjectNodeId).toBe('P_resolved');
  expect(api.calls).toContain('resolveProject');
});

test('a project with neither node id nor valid URL is reported, not synced', async () => {
  db.insert(schema.projects)
    .values({ owner: 'o', repo: 'bad', config: { baseBranch: 'main' } })
    .run();
  await sync.push();
  expect(eventTypes()).toContain('github_sync_error');
});

test('each project syncs with its own token; a project without one is reported', async () => {
  const other = new FakeGitHubApi();
  db.insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'two',
      githubProjectNodeId: 'P_2',
      githubToken: 'tok-two',
      config: { baseBranch: 'main' },
    })
    .run();
  db.insert(schema.projects)
    .values({
      owner: 'o',
      repo: 'bare',
      githubProjectNodeId: 'P_3',
      config: { baseBranch: 'main' },
    })
    .run();
  const byToken = new GitHubMirror(db, (project) => {
    if (project.githubToken === 'tok-two') {
      return other;
    }
    return project.repo === 'r' ? api : null;
  });
  createTicket(db, { projectId: 2, title: 'second project ticket' });
  await byToken.push();
  expect(api.issues).toHaveLength(1);
  expect(other.issues).toHaveLength(1);
  await byToken.push();
  const missing = db
    .select()
    .from(schema.events)
    .all()
    .filter((event) => event.type === 'github_sync_error');
  expect(missing).toHaveLength(1);
});

test('approving the final review marks the draft PR ready, once', async () => {
  await sync.push();
  await api.createPullRequest(
    { owner: 'o', repo: 'r' },
    { title: 't', body: 'b', head: 'x', base: 'main' },
  );
  const [pull] = api.pulls;
  db.update(schema.tickets)
    .set({
      prNumber: pull?.number ?? 0,
      phase: { kind: 'awaiting_approval', step: 'final_review' },
    })
    .run();
  await sync.push();
  expect(api.pulls[0]?.draft).toBe(true);

  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .run();
  await sync.push();
  await sync.push();
  expect(api.pulls[0]?.draft).toBe(false);
  expect(api.calls.filter((call) => call === 'markPullRequestReady')).toHaveLength(1);
  expect(eventTypes()).toContain('pull_request_ready');
});
