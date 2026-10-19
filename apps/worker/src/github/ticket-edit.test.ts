import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, getTicket, migrateDb, schema, type Db } from '@union/core';

import { NO_HOOKS } from '../command-hooks';
import { drainCommands } from '../commands';
import { FakeGitHubApi } from './fake-api';
import { GitHubMirror } from './mirror';
import { editTicket, ticketEditOf } from './ticket-edit';

let db: Db;
let api: FakeGitHubApi;
let sync: GitHubMirror;
let ticketId: number;

const BASE = { title: 'Add search', body: 'Details' };
const EDIT = { title: 'Add fuzzy search', body: 'Match typos too', base: BASE };

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
  ticketId = createTicket(db, { projectId: project.id, ...BASE }).id;
});

function logged(): { type: string; payload: unknown }[] {
  return db
    .select({ type: schema.events.type, payload: schema.events.payload })
    .from(schema.events)
    .all()
    .filter((event) => event.type.startsWith('ticket_edit'));
}

test('the edit is written to the issue, marker kept, then to the ticket', async () => {
  await sync.push();
  await editTicket(db, () => api, ticketId, EDIT);
  expect(api.issueByNumber(1)).toMatchObject({
    title: EDIT.title,
    body: `${EDIT.body}\n\n<!-- union:ticket=${ticketId} -->`,
  });
  expect(getTicket(db, ticketId)).toMatchObject({ title: EDIT.title, body: EDIT.body });
  expect(logged()).toEqual([{ type: 'ticket_edited', payload: {} }]);
});

test('the next pull does not read the edit back as a change from GitHub', async () => {
  await sync.push();
  await sync.pull();
  await editTicket(db, () => api, ticketId, EDIT);
  await sync.pull();
  const types = db
    .select()
    .from(schema.events)
    .all()
    .map((event) => event.type);
  expect(types).not.toContain('ticket_updated_from_github');
});

test('a pull that read the issue before the edit does not undo it', async () => {
  await sync.push();
  const before = await api.listProjectItems();
  await editTicket(db, () => api, ticketId, EDIT);
  api.listProjectItems = (): Promise<typeof before> => Promise.resolve(before);
  await sync.pull();
  expect(getTicket(db, ticketId)).toMatchObject({ title: EDIT.title, body: EDIT.body });
});

test('an issue without Union’s marker (an imported one) gets none', async () => {
  await sync.push();
  api.editRemote(1, { body: BASE.body });
  await editTicket(db, () => api, ticketId, EDIT);
  expect(api.issueByNumber(1).body).toBe(EDIT.body);
});

test('an issue edited on GitHub since the edit was opened is not overwritten', async () => {
  await sync.push();
  api.editRemote(1, { body: 'Changed on GitHub' });
  await editTicket(db, () => api, ticketId, EDIT);
  expect(api.issueByNumber(1).body).toBe('Changed on GitHub');
  expect(getTicket(db, ticketId)).toMatchObject(BASE);
  expect(logged()).toMatchObject([{ type: 'ticket_edit_failed' }]);
  expect(JSON.stringify(logged())).toContain('changed on GitHub');
});

test('a ticket without an issue yet is edited locally; the issue is created with it', async () => {
  await editTicket(db, () => null, ticketId, EDIT);
  expect(getTicket(db, ticketId)).toMatchObject({ title: EDIT.title, body: EDIT.body });
  await sync.push();
  expect(api.issueByNumber(1).title).toBe(EDIT.title);
});

test('a project without credentials fails the edit', async () => {
  await sync.push();
  await editTicket(db, () => null, ticketId, EDIT);
  expect(logged()).toMatchObject([
    { type: 'ticket_edit_failed', payload: { error: 'This project has no GitHub credentials' } },
  ]);
  expect(getTicket(db, ticketId)).toMatchObject(BASE);
});

test('the edit_ticket command reaches the hook with its payload', () => {
  const edits: unknown[] = [];
  db.insert(schema.commands).values({ type: 'edit_ticket', ticketId, payload: EDIT }).run();
  drainCommands(db, {
    ...NO_HOOKS,
    editTicket: (id, edit) => {
      edits.push({ id, edit });
    },
  });
  expect(edits).toEqual([{ id: ticketId, edit: EDIT }]);
  expect(() => ticketEditOf({ title: 'x', body: 'y' })).toThrow('edit_ticket needs');
});
