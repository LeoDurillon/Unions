import { beforeEach, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  listSlices,
  migrateDb,
  replaceSlices,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { Ask } from './leftovers';
import { REPO_DIR } from './provision';
import { restackRevision } from './stack-revise';
import { conflictPrompt } from './stack-revise-conflict';

let root: string;
let db: Db;
let ticketId: number;

const repo = (): string => path.join(root, 'container');

async function git(...args: string[]): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd: repo(),
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  });
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) {
    throw new Error(`git ${args.join(' ')}: ${err}`);
  }
  return out.trim();
}

async function commit(file: string, content: string, message: string): Promise<string> {
  await writeFile(path.join(repo(), file), content);
  await git('add', file);
  await git('commit', '--quiet', '-m', message);
  return git('rev-parse', 'HEAD');
}

/** A "container" whose commands run on this machine, in the test's repository. */
const runtime = {
  async *exec(_name: string, command: string[]): AsyncGenerator<string, ExecResult> {
    const proc = Bun.spawn(
      command.map((arg) => arg.replaceAll(REPO_DIR, repo())),
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
      },
    );
    const [exitCode, out, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    for (const line of out.split('\n').filter((text) => text !== '')) {
      yield line;
    }
    return { exitCode, stderr };
  },
} as unknown as ContainerRuntime;

let table: string;

// Split already: the table is slice 1 (`feature-s1`); slice 2 sorts it, on the same line.
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-restack-'));
  await Bun.$`git init --quiet --initial-branch=main ${repo()}`.quiet();
  await commit('a.txt', 'one\n', 'Start');
  await git('checkout', '--quiet', '-b', 'feature');
  table = await commit('m.txt', 'table\n', 'Add the table\n\nSlice: 1');
  await git('branch', '--quiet', 'feature-s1');
  const sorted = await commit('m.txt', 'table, sorted\n', 'Sort the table\n\nSlice: 2');
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Invoices' }).id;
  db.update(schema.tickets)
    .set({ branch: 'feature', prState: 'open', prNumber: 2 })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  replaceSlices(db, ticketId, [
    { position: 1, title: 'Table', spec: 'Table', tipSha: table, branch: 'feature-s1' },
    { position: 2, title: 'Sort', spec: 'Sort', tipSha: sorted, branch: 'feature' },
  ]);
});

function workspace(): Parameters<typeof restackRevision>[0] {
  const project = db.select().from(schema.projects).get();
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  if (!project || !ticket) {
    throw new Error('fixture missing');
  }
  const deps = { db, runtime } as Parameters<typeof restackRevision>[0]['deps'];
  const context = { ticket } as Parameters<typeof restackRevision>[0]['context'];
  return { deps, context, project, container: 'c', branch: 'feature', base: 'main' };
}

/** An implementer that resolves each stop by writing `m.txt` as `resolutions` says, then stages it. */
function resolver(resolutions: { onFix: string; onSort: string }, asked: string[]): Ask {
  return async (prompt) => {
    asked.push(prompt);
    const content = prompt.includes("slice 2's commit") ? resolutions.onSort : resolutions.onFix;
    await writeFile(path.join(repo(), 'm.txt'), content);
    await git('add', 'm.txt');
    return 'Resolved.';
  };
}

const subjects = (range: string): Promise<string> => git('log', '--reverse', '--format=%s', range);

test('a fix to a lower slice goes into it, the conflicts with the slices above resolved by the implementer', async () => {
  await commit('m.txt', 'table, sorted, indexed\n', `fixup! ${table.slice(0, 8)}`);
  const tree = await git('rev-parse', 'HEAD^{tree}');
  const asked: string[] = [];
  const ask = resolver({ onFix: 'table, indexed\n', onSort: 'table, sorted, indexed\n' }, asked);
  expect(await restackRevision(workspace(), ask)).toEqual({ changed: [1], conflicts: 2 });
  expect(asked).toHaveLength(2);
  expect(asked[0]).toContain('moved into its slice, in `m.txt`');
  expect(await git('rev-parse', 'HEAD^{tree}')).toBe(tree);
  expect(await git('show', 'feature-s1:m.txt')).toBe('table, indexed');
  expect(await subjects('main..feature-s1')).toBe('Add the table');
  expect(await subjects('feature-s1..feature')).toBe('Sort the table');
});

test('a conflict the implementer leaves aborts the replay, the branch as it was', async () => {
  const head = await commit('m.txt', 'table, sorted, indexed\n', `fixup! ${table.slice(0, 8)}`);
  const restacked = await restackRevision(workspace(), () => Promise.resolve(null));
  expect(restacked !== null && 'error' in restacked && restacked.error).toContain(
    'did not resolve',
  );
  expect(await git('rev-parse', 'HEAD')).toBe(head);
  expect(await git('status')).not.toContain('rebase in progress');
});

test('a resolution that changes the code puts every branch back, unpushed', async () => {
  const head = await commit('m.txt', 'table, sorted, indexed\n', `fixup! ${table.slice(0, 8)}`);
  const ask = resolver({ onFix: 'table, indexed\n', onSort: 'table, sorted\n' }, []);
  const restacked = await restackRevision(workspace(), ask);
  expect(restacked !== null && 'error' in restacked && restacked.error).toContain('put back');
  expect(await git('rev-parse', 'HEAD')).toBe(head);
  expect(await git('rev-parse', 'feature-s1')).toBe(listSlices(db, ticketId)[0]?.tipSha ?? '');
});

test("the conflict prompt names the slice's commit and the branch the stack must end at", () => {
  const stack = [
    { position: 1, branch: 'feature-s1', commits: ['a'.repeat(40)] },
    { position: 2, branch: 'feature', commits: ['b'.repeat(40)] },
  ];
  const stop = { sha: 'b'.repeat(40), subject: 'Sort the table', files: ['m.txt'] };
  const prompt = conflictPrompt(stack, { stop, head: 'c'.repeat(40) });
  expect(prompt).toContain("slice 2's commit `bbbbbbbb Sort the table`, replayed over your fix");
  expect(prompt).toContain('exactly your branch as you left it (`cccccccc`)');
});
