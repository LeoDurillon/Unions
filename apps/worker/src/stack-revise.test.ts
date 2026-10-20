import { beforeEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  listSlices,
  type Ticket,
  migrateDb,
  replaceSlices,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { captureDiff } from './diff-snapshot';
import { AGENT_HOME, REPO_DIR } from './provision';
import { runRebaseStep } from './rebase';
import { pushRevision, restackRevision, stackSection } from './stack-revise';

const INBOX = '/tmp/union-fetch';

let root: string;
let db: Db;
let ticketId: number;
let projectId: number;

async function git(cwd: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
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

async function commit(cwd: string, file: string, content: string, message: string): Promise<void> {
  await writeFile(path.join(cwd, file), content);
  await git(cwd, 'add', file);
  await git(cwd, 'commit', '--quiet', '-m', message);
}

function hostPath(value: string): string {
  return value
    .replaceAll(INBOX, path.join(root, 'inbox'))
    .replaceAll(REPO_DIR, path.join(root, 'container'))
    .replaceAll(AGENT_HOME, path.join(root, 'home'));
}

/** A "container" whose commands run on this machine, its paths mapped into the test directory. */
const runtime = {
  create: () => Promise.resolve(),
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  isRunning: () => Promise.resolve(true),
  writeFile: () => Promise.resolve(),
  async copyIn(_name: string, hostDir: string, containerDir: string): Promise<void> {
    await cp(hostDir, hostPath(containerDir), { recursive: true });
  },
  async copyOut(_name: string, containerPath: string, target: string): Promise<void> {
    await cp(hostPath(containerPath), target);
  },
  async *exec(_name: string, command: string[]): AsyncGenerator<string, ExecResult> {
    const proc = Bun.spawn(
      command.map((arg) => hostPath(arg)),
      { stdout: 'pipe', stderr: 'pipe' },
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
  *runHelper(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const container = (): string => path.join(root, 'container');
const origin = (): string => path.join(root, 'acme', 'shop.git');

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-split-'));
  const seed = path.join(root, 'seed');
  await mkdir(path.dirname(origin()), { recursive: true });
  await git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin());
  await git(root, 'clone', '--quiet', origin(), seed);
  await commit(seed, 'a.txt', 'one\n', 'Start');
  await git(seed, 'push', '--quiet', 'origin', 'main');
  await git(seed, 'checkout', '--quiet', '-b', 'feature');
  await commit(seed, 'c.txt', 'crud\n', 'Add the CRUD');
  await commit(seed, 'm.txt', 'table\n', 'Add the table');
  await git(seed, 'push', '--quiet', 'origin', 'feature');
  await git(root, 'clone', '--quiet', '--branch', 'feature', origin(), container());
  await git(container(), 'branch', '--quiet', 'main', 'origin/main');
  await writeFile(
    path.join(root, 'credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }),
  );
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Invoices' }).id;
  db.update(schema.tickets)
    .set({ branch: 'feature', prState: 'open', prNumber: 2, issueNumber: 1 })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  // Split already: the table is slice 1 (`feature-s1`), the CRUD slice 2 (the ticket's branch).
  await git(container(), 'checkout', '--quiet', '-B', 'feature', 'origin/feature');
  await git(container(), 'reset', '--quiet', '--hard', 'origin/main');
  await commit(container(), 'm.txt', 'table\n', 'Add the table\n\nSlice: 1');
  await git(container(), 'branch', '--quiet', 'feature-s1');
  await commit(container(), 'c.txt', 'crud\n', 'Add the CRUD\n\nSlice: 2');
  await git(container(), 'push', '--quiet', '--force', 'origin', 'feature', 'feature-s1');
  replaceSlices(db, ticketId, [
    slice(1, 'feature-s1', await git(container(), 'rev-parse', 'feature-s1')),
    slice(2, 'feature', await git(container(), 'rev-parse', 'feature')),
  ]);
});

function slice(
  position: number,
  branch: string,
  tipSha: string,
): Parameters<typeof replaceSlices>[2][number] {
  const title = position === 1 ? 'Migration' : 'CRUD';
  return { position, title, spec: title, tipSha, branch, prNumber: position + 1, prState: 'open' };
}

function loadTicket(): Ticket {
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  if (!ticket) {
    throw new Error('ticket missing');
  }
  return ticket;
}

function deps(): Parameters<typeof runRebaseStep>[0] {
  return {
    db,
    runtime,
    config: {
      image: 'i',
      gitBaseUrl: `file://${root}`,
      credentialsPath: path.join(root, 'credentials.json'),
    },
    github: () => null,
    agent: () => Promise.resolve({ kind: 'error', message: 'no agent in this test' }),
  };
}

function context(step: 'rebase' | 'implement'): Parameters<typeof runRebaseStep>[1] {
  return {
    ticket: loadTicket(),
    step,
    revision: null,
    resumeSessionId: null,
    log: () => {
      // not checked
    },
    signal: new AbortController().signal,
    resume: null,
  };
}

function workspace(): Parameters<typeof restackRevision>[0] {
  const project = db.select().from(schema.projects).get();
  if (!project) {
    throw new Error('project missing');
  }
  return {
    deps: deps(),
    context: context('implement'),
    project,
    container: 'c',
    branch: 'feature',
    base: 'main',
  };
}

const subjects = (range: string): Promise<string> =>
  git(origin(), 'log', '--reverse', '--format=%s', range);

test('a rebase moves every slice onto the new base and pushes them together', async () => {
  const seed = path.join(root, 'seed');
  await git(seed, 'checkout', '--quiet', 'main');
  await commit(seed, 'd.txt', 'upstream\n', 'Upstream');
  await git(seed, 'push', '--quiet', 'origin', 'main');
  const result = await runRebaseStep(deps(), context('rebase'));
  expect(result).toMatchObject({ kind: 'ok', clean: true });
  expect(await subjects('main..feature-s1')).toBe('Add the table');
  expect(await subjects('feature-s1..feature')).toBe('Add the CRUD');
  expect(await git(origin(), 'merge-base', '--is-ancestor', 'main', 'feature-s1')).toBe('');
  const tips = listSlices(db, ticketId).map((entry) => entry.tipSha);
  expect(tips).toEqual([
    await git(origin(), 'rev-parse', 'feature-s1'),
    await git(origin(), 'rev-parse', 'feature'),
  ]);
});

test("a revision's commits go into their slices: a Slice trailer at its end, a fixup into its commit", async () => {
  const crud = await git(container(), 'rev-parse', 'feature');
  await commit(container(), 'm.txt', 'table, indexed\n', 'Index the table\n\nSlice: 1');
  await commit(container(), 'c.txt', 'crud, fixed\n', `fixup! ${crud.slice(0, 8)}`);
  const tree = await git(container(), 'rev-parse', 'HEAD^{tree}');
  const asked: string[] = [];
  const restacked = await restackRevision(workspace(), (prompt) => {
    asked.push(prompt);
    return Promise.resolve(null);
  });
  expect(restacked).toEqual({ changed: [1, 2] });
  expect(asked).toEqual([]);
  expect(await git(container(), 'rev-parse', 'HEAD^{tree}')).toBe(tree);
  expect(await pushRevision(workspace())).toMatchObject({ pushed: true, error: null });
  expect(await subjects('main..feature-s1')).toBe('Add the table\nIndex the table');
  expect(await subjects('feature-s1..feature')).toBe('Add the CRUD');
  expect(await git(origin(), 'show', 'feature:c.txt')).toBe('crud, fixed');
  expect(listSlices(db, ticketId)[0]?.tipSha).toBe(await git(origin(), 'rev-parse', 'feature-s1'));
});

test('a commit naming no slice is asked about in the session, then placed', async () => {
  await commit(container(), 'c.txt', 'crud, more\n', 'More CRUD');
  const sha = await git(container(), 'rev-parse', 'HEAD');
  const restacked = await restackRevision(workspace(), (prompt) =>
    Promise.resolve(prompt.includes('More CRUD') ? `${sha.slice(0, 10)} Slice: 2` : null),
  );
  expect(restacked).toEqual({ changed: [2] });
});

test('a commit still unplaced after the question fails the step, nothing moved', async () => {
  await commit(container(), 'c.txt', 'crud, more\n', 'More CRUD');
  const head = await git(container(), 'rev-parse', 'HEAD');
  const restacked = await restackRevision(workspace(), () => Promise.resolve('no idea'));
  expect(restacked !== null && 'error' in restacked && restacked.error).toContain('names no slice');
  expect(await git(container(), 'rev-parse', 'HEAD')).toBe(head);
});

function ask(): Promise<null> {
  return Promise.resolve(null);
}

test('a ticket that is not split, or a revision with no commit, is left to the usual push', async () => {
  expect(await restackRevision(workspace(), ask)).toBeNull();
  replaceSlices(db, ticketId, []);
  await commit(container(), 'c.txt', 'crud, more\n', 'More CRUD');
  expect(await restackRevision(workspace(), ask)).toBeNull();
});

test('the implementer is told the slices, their commits, and how to place a new commit', async () => {
  const section = await stackSection(workspace());
  expect(section).toMatch(/1\. \*\*Migration\*\* \(`feature-s1`\): [0-9a-f]+ Add the table/u);
  expect(section).toContain("2. **CRUD** (`feature`, the ticket's own pull request)");
  expect(section).toContain('`Slice: <n>` trailer');
  replaceSlices(db, ticketId, []);
  expect(await stackSection(workspace())).toBe('');
});

test("the diff snapshot holds each slice's own change, the lower ones read from their branches", async () => {
  await captureDiff(db, runtime, { container: 'c', ticketId, base: 'main' });
  const rows = db
    .select()
    .from(schema.diffCommits)
    .all()
    .filter((row) => row.kind === 'slice');
  expect(rows.map((row) => [row.position, row.title])).toEqual([
    [1, 'Migration'],
    [2, 'CRUD'],
  ]);
  const files = db.select().from(schema.diffCommitFiles).all();
  const pathsOf = (commitId: number | undefined): string[] =>
    files.filter((file) => file.commitId === commitId).map((file) => file.path);
  expect(pathsOf(rows[0]?.id)).toEqual(['m.txt']);
  expect(pathsOf(rows[1]?.id)).toEqual(['c.txt']);
});
