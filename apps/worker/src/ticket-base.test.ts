import { afterAll, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

import { resolveTicketBase } from './ticket-base';

async function run(cmd: string[]): Promise<void> {
  const proc = Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
  expect(await proc.exited).toBe(0);
}

const root = await mkdtemp(path.join(tmpdir(), 'union-base-test-'));
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
const repo = path.join(root, 'repo');
await run(['git', 'init', '-q', '-b', 'main', repo]);
await run([
  'git',
  '-C',
  repo,
  '-c',
  'user.email=a@b',
  '-c',
  'user.name=t',
  'commit',
  '-q',
  '--allow-empty',
  '-m',
  'init',
]);
await run(['git', '-C', repo, 'branch', '12-parent']);
const source = { url: repo, publicUrl: repo, secret: null };

let db: Db;
let parent: number;
let child: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P_1', config: { baseBranch: 'main' } })
    .returning()
    .get();
  parent = createTicket(db, { projectId: project.id, title: 'parent' }).id;
  child = createTicket(db, { projectId: project.id, title: 'child' }).id;
  setParent(db, child, parent);
});

function setParentBranch(branch: string): void {
  db.update(schema.tickets)
    .set({ branch, phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, parent))
    .run();
}

test("a child starts from its parent's pushed branch", async () => {
  setParentBranch('12-parent');
  expect(await resolveTicketBase(db, getTicket(db, child), source)).toBe('12-parent');
  expect(getTicket(db, child).baseBranch).toBe('12-parent');
});

test("a deleted parent branch (merged) falls back to the project's base", async () => {
  setParentBranch('13-gone');
  expect(await resolveTicketBase(db, getTicket(db, child), source)).toBeNull();
  expect(getTicket(db, child).baseBranch).toBeNull();
  const types = db
    .select()
    .from(schema.events)
    .all()
    .map((event) => event.type);
  expect(types).toContain('parent_branch_missing');
});

test('a ticket without a parent uses the project base', async () => {
  expect(await resolveTicketBase(db, getTicket(db, parent), source)).toBeNull();
});
