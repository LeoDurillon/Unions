import { beforeEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { ensureFollowedBase } from './followed-base-ref';
import { AGENT_HOME, REPO_DIR } from './provision';

type StepContext = Parameters<typeof ensureFollowedBase>[1];

const INBOX = '/tmp/union-fetch';

let root: string;
let db: Db;
let ticketId: number;

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

async function commit(cwd: string, file: string, content: string): Promise<void> {
  await writeFile(path.join(cwd, file), content);
  await git(cwd, 'add', file);
  await git(cwd, 'commit', '--quiet', '-m', `edit ${file}`);
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

/** `main`, and the ticket's `child` cloned alone into the container: it has no local `main`. */
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-follow-ref-'));
  const seed = path.join(root, 'seed');
  await mkdir(path.dirname(origin()), { recursive: true });
  await git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin());
  await git(root, 'clone', '--quiet', origin(), seed);
  await commit(seed, 'a.txt', 'one\n');
  await git(seed, 'push', '--quiet', 'origin', 'main');
  await git(seed, 'checkout', '--quiet', '-b', 'child');
  await commit(seed, 'c.txt', 'the child\n');
  await git(seed, 'push', '--quiet', 'origin', 'child');
  await git(
    root,
    'clone',
    '--quiet',
    '--single-branch',
    '--branch',
    'child',
    origin(),
    container(),
  );
  await writeFile(
    path.join(root, 'credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }),
  );
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'Child' }).id;
  db.update(schema.tickets)
    .set({ branch: 'child', baseBranch: 'main', prNumber: 7, phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
});

const agent = (): never => {
  throw new Error('not expected');
};

function prepare(): Promise<void> {
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  if (!ticket) {
    throw new Error('ticket missing');
  }
  const context = { ticket, step: 'implement' } as StepContext;
  const config = {
    image: 'i',
    gitBaseUrl: `file://${root}`,
    credentialsPath: path.join(root, 'credentials.json'),
  };
  return ensureFollowedBase({ db, runtime, config, github: () => null, agent }, context);
}

async function hasLocalMain(): Promise<boolean> {
  const refs = await git(container(), 'for-each-ref', '--format=%(refname)', 'refs/heads');
  return refs.split('\n').includes('refs/heads/main');
}

test('after a follow, a step finds the new base in the workspace', async () => {
  db.update(schema.tickets)
    .set({ leftBase: { branch: 'parent', prNumber: 5 } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  await prepare();
  expect(await hasLocalMain()).toBe(true);
});

test('a ticket that never followed a base is left alone', async () => {
  await prepare();
  expect(await hasLocalMain()).toBe(false);
});
