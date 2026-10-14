import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';
import { asc, eq } from 'drizzle-orm';

import { parseLog } from './diff-commits';
import { captureDiff } from './diff-snapshot';
import { REPO_DIR } from './provision';

let repo: string;
let db: Db;
let ticketId: number;

async function sh(args: string[]): Promise<string> {
  const proc = Bun.spawn(['git', '-C', repo, ...args], {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: 'a@x',
      GIT_COMMITTER_NAME: 'Ada',
      GIT_COMMITTER_EMAIL: 'a@x',
    },
  });
  const [output] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return output.trim();
}

async function commit(file: string, content: string, message: string): Promise<string> {
  await Bun.write(path.join(repo, file), content);
  await sh(['add', file]);
  await sh(['commit', '-q', '-m', message]);
  return sh(['rev-parse', 'HEAD']);
}

/** The container's git, run on a local repository instead. */
const runtime = {
  async *exec(_name: string, command: string[]): AsyncGenerator<string, ExecResult> {
    const args = command.map((arg) => (arg === REPO_DIR ? repo : arg));
    const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    for (const line of stdout.replace(/\n$/u, '').split('\n')) {
      yield line;
    }
    return { exitCode, stderr };
  },
} as unknown as ContainerRuntime;

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), 'union-diff-'));
  await sh(['init', '-q', '-b', 'main']);
  await commit('a.txt', 'one\n', 'Start');
  await sh(['checkout', '-q', '-b', 'work']);
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = db
    .insert(schema.tickets)
    .values({ projectId, title: 't', body: '' })
    .returning()
    .get().id;
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

function stored(): { kind: string; title: string; files: string[] }[] {
  return db
    .select()
    .from(schema.diffCommits)
    .orderBy(asc(schema.diffCommits.position))
    .all()
    .map((row) => ({
      kind: row.kind,
      title: row.title,
      files: db
        .select()
        .from(schema.diffCommitFiles)
        .where(eq(schema.diffCommitFiles.commitId, row.id))
        .all()
        .map((file) => `${file.path} +${file.additions}`),
    }));
}

test('each commit of the branch is kept with its own files, oldest first', async () => {
  await commit('a.txt', 'one\ntwo\n', 'Add two\n\nBecause.');
  await commit('b.txt', 'new\n', 'Add b');
  await captureDiff(db, runtime, { container: 'c', ticketId, base: 'main' });
  expect(stored()).toEqual([
    { kind: 'commit', title: 'Add two', files: ['a.txt +1'] },
    { kind: 'commit', title: 'Add b', files: ['b.txt +1'] },
  ]);
  expect(db.select().from(schema.diffCommits).all()[0]?.body).toBe('Because.');
});

test('after a review, the change since the reviewed head comes first; a new snapshot replaces all', async () => {
  const reviewed = await commit('a.txt', 'one\ntwo\n', 'Add two');
  await captureDiff(db, runtime, { container: 'c', ticketId, base: 'main' });
  db.update(schema.tickets)
    .set({ reviewedSha: reviewed })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  await commit('b.txt', 'new\n', 'Fix review');
  await captureDiff(db, runtime, { container: 'c', ticketId, base: 'main' });
  expect(stored()).toEqual([
    { kind: 'since_review', title: 'Since last review', files: ['b.txt +1'] },
    { kind: 'commit', title: 'Add two', files: ['a.txt +1'] },
    { kind: 'commit', title: 'Fix review', files: ['b.txt +1'] },
  ]);
});

test('a reviewed head no longer in the branch (rebased) gives no "since last review"', async () => {
  await commit('a.txt', 'one\ntwo\n', 'Add two');
  db.update(schema.tickets)
    .set({ reviewedSha: 'f'.repeat(40) })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  await captureDiff(db, runtime, { container: 'c', ticketId, base: 'main' });
  expect(stored().map((row) => row.kind)).toEqual(['commit']);
});

test('the log parser reads merges and empty bodies', () => {
  const log =
    'aaa\u001FAda\u001F2026-10-01T10:00:00+02:00\u001Fp1 p2\u001FMerge main\u001F\u001E\n';
  expect(parseLog(log)).toEqual([
    {
      sha: 'aaa',
      author: 'Ada',
      date: '2026-10-01T10:00:00+02:00',
      parents: 2,
      title: 'Merge main',
      body: '',
    },
  ]);
});
