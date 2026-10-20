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

import { FakeGitHubApi } from './github/fake-api';
import { AGENT_HOME, REPO_DIR } from './provision';
import { runRestackStep } from './restack';

const INBOX = '/tmp/union-fetch';

let root: string;
let github: FakeGitHubApi;
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
  github = new FakeGitHubApi();
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

/** Slice 1 squash-merged into main on GitHub, with `extra` changes; the worker started a restack. */
async function squashSliceOne(extra?: { file: string; content: string }): Promise<string> {
  const tip = await git(container(), 'rev-parse', 'feature-s1');
  const seed = path.join(root, 'seed');
  await git(seed, 'checkout', '--quiet', 'main');
  await git(seed, 'pull', '--quiet', 'origin', 'main');
  await writeFile(path.join(seed, 'm.txt'), 'table\n');
  if (extra) {
    await writeFile(path.join(seed, extra.file), extra.content);
  }
  await git(seed, 'add', '-A');
  await git(seed, 'commit', '--quiet', '-m', 'Add the table (#3)');
  await git(seed, 'push', '--quiet', 'origin', 'main');
  const [bottom] = listSlices(db, ticketId);
  db.update(schema.ticketSlices)
    .set({ prState: 'merged', prMergedAt: 1, mergedInto: 'main', mergedTipSha: tip })
    .where(eq(schema.ticketSlices.id, bottom?.id ?? 0))
    .run();
  db.update(schema.tickets)
    .set({
      phase: {
        kind: 'running',
        step: 'restack',
        thenRun: 'final_review',
        thenDone: true,
        hostOnly: true,
      },
    })
    .run();
  return tip;
}

function restack(): ReturnType<typeof runRestackStep> {
  return runRestackStep(
    {
      db,
      runtime,
      config: {
        image: 'i',
        gitBaseUrl: `file://${root}`,
        credentialsPath: path.join(root, 'credentials.json'),
      },
      github: () => github,
      agent: () => Promise.resolve({ kind: 'error', message: 'no agent for a host-only restack' }),
    },
    {
      ticket: loadTicket(),
      step: 'restack',
      revision: null,
      resumeSessionId: null,
      log: () => {
        // not checked
      },
      signal: new AbortController().signal,
      resume: null,
    },
  );
}

test('after a squash merge, only the slices above move onto the base, and the next PR targets it', async () => {
  const pull = await github.createPullRequest(
    { owner: 'acme', repo: 'shop' },
    { title: 'CRUD', body: '', head: 'feature', base: 'feature-s1' },
  );
  db.update(schema.ticketSlices)
    .set({ prNumber: pull.number })
    .where(eq(schema.ticketSlices.branch, 'feature'))
    .run();
  await squashSliceOne();
  const result = await restack();
  expect(result).toMatchObject({ kind: 'ok', clean: true });
  expect(await git(origin(), 'log', '--format=%s', 'main..feature')).toBe('Add the CRUD');
  expect(github.pullByNumber(pull.number).base).toBe('main');
  expect(result.kind === 'ok' && result.output).toContain(`**Retargeted** #${pull.number}`);
  expect(listSlices(db, ticketId).map((entry) => entry.mergedTipSha)).toEqual([null, null]);
  expect(listSlices(db, ticketId)[1]?.tipSha).toBe(await git(origin(), 'rev-parse', 'feature'));
});

test('a restack started after a merge stops on a conflict without an agent: nothing pushed', async () => {
  const pushed = await git(origin(), 'rev-parse', 'feature');
  const tip = await squashSliceOne({ file: 'c.txt', content: 'theirs\n' });
  const result = await restack();
  expect(result.kind === 'error' && result.error).toContain('click Restack in the PR tab');
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushed);
  expect(listSlices(db, ticketId)[0]?.mergedTipSha).toBe(tip);
});

test('nothing merged into the base: nothing to restack', async () => {
  const result = await restack();
  expect(result.kind === 'error' && result.error).toContain('nothing to restack');
});
