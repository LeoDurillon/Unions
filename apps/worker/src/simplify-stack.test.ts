import { beforeEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
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

import type { AgentFn } from './agent';
import { runHistoryStep } from './history-steps';
import { AGENT_HOME, REPO_DIR } from './provision';
import type { StepResult } from './scheduler';

const INBOX = '/tmp/union-fetch';

let root: string;
let db: Db;
let ticketId: number;
let prompts: string[];

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
  root = await mkdtemp(path.join(tmpdir(), 'union-stack-simplify-'));
  const seed = path.join(root, 'seed');
  await mkdir(path.dirname(origin()), { recursive: true });
  await git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin());
  await git(root, 'clone', '--quiet', origin(), seed);
  await commit(seed, 'a.txt', 'one\n', 'Start');
  await git(seed, 'push', '--quiet', 'origin', 'main');
  // Split already: the table and its fix-up are slice 1 (`feature-s1`), the CRUD and its fix-up
  // slice 2 (the ticket's branch).
  await git(seed, 'checkout', '--quiet', '-b', 'feature');
  await commit(seed, 'm.txt', 'tabel\n', 'Add the table\n\nSlice: 1');
  await commit(seed, 'm.txt', 'table\n', 'fix typo\n\nSlice: 1');
  await git(seed, 'branch', '--quiet', 'feature-s1');
  await commit(seed, 'c.txt', 'crud\n', 'Add the CRUD\n\nSlice: 2');
  await commit(seed, 'c.txt', 'crud, fixed\n', 'address review\n\nSlice: 2');
  await git(seed, 'push', '--quiet', 'origin', 'feature', 'feature-s1');
  await git(root, 'clone', '--quiet', '--branch', 'feature', origin(), container());
  await git(container(), 'branch', '--quiet', 'main', 'origin/main');
  await writeFile(
    path.join(root, 'credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }),
  );
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Invoices' }).id;
  db.update(schema.tickets)
    .set({ branch: 'feature', prState: 'open', prNumber: 3, issueNumber: 1 })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  replaceSlices(db, ticketId, [
    slice(1, 'feature-s1', await git(origin(), 'rev-parse', 'feature-s1')),
    slice(2, 'feature', await git(origin(), 'rev-parse', 'feature')),
  ]);
  prompts = [];
});

function slice(
  position: number,
  branch: string,
  tipSha: string,
): Parameters<typeof replaceSlices>[2][number] {
  const title = position === 1 ? 'Migration' : 'CRUD';
  return { position, title, spec: title, tipSha, branch, prNumber: position + 1, prState: 'open' };
}

/** An agent that runs `change` in the workspace, given the fork point and the slices' tips. */
function agentDoing(change: (fork: string, tips: string[]) => Promise<unknown>): AgentFn {
  return async (_runtime, agentRun) => {
    prompts.push(agentRun.prompt);
    const fork = await git(container(), 'merge-base', 'HEAD', 'origin/main');
    await change(
      fork,
      listSlices(db, ticketId).map((entry) => entry.tipSha),
    );
    return { kind: 'ok', text: 'Folded the fix-ups.', sessionId: 's3' };
  };
}

/** Commits what `tip` holds as one commit of `slice`, from the files it changes. */
async function commitSlice(tip: string, position: number, subject: string): Promise<void> {
  await git(container(), 'checkout', tip, '--', '.');
  await git(container(), 'add', '-A');
  await git(container(), 'commit', '--quiet', '-m', `${subject}\n\nSlice: ${position}`);
}

/** One commit per slice, each slice ending as it did. */
const folds = agentDoing(async (fork, [table = '', crud = '']) => {
  await git(container(), 'reset', '--quiet', '--hard', fork);
  await commitSlice(table, 1, 'Add the table');
  await commitSlice(crud, 2, 'Add the CRUD');
});

/** One commit in slice 1 holding both slices: the top ends the same, slice 1 does not. */
const merges = agentDoing(async (fork, [, crud = '']) => {
  await git(container(), 'reset', '--quiet', '--hard', fork);
  await commitSlice(crud, 1, 'Add the table and the CRUD');
  await git(container(), 'commit', '--quiet', '--allow-empty', '-m', 'Empty\n\nSlice: 2');
});

function run(agent: AgentFn): Promise<StepResult> {
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  if (!ticket) {
    throw new Error('ticket missing');
  }
  const deps = {
    db,
    runtime,
    config: {
      image: 'i',
      gitBaseUrl: `file://${root}`,
      credentialsPath: path.join(root, 'credentials.json'),
    },
    github: () => null,
    agent,
  };
  const context = {
    ticket,
    step: 'simplify' as const,
    revision: null,
    resumeSessionId: null,
    log: () => {
      // not checked
    },
    signal: new AbortController().signal,
    resume: null,
  };
  return runHistoryStep(deps, context, 'simplify');
}

const subjects = (range: string): Promise<string> =>
  git(origin(), 'log', '--reverse', '--format=%s', range);

test('each slice is simplified on its own, the same content at every tip, and the stack pushed', async () => {
  const trees = await Promise.all(
    ['feature-s1', 'feature'].map((ref) => git(origin(), 'rev-parse', `${ref}^{tree}`)),
  );
  const result = await run(folds);
  expect(result.kind).toBe('ok');
  expect(prompts[0]).toContain('# Stack');
  expect(prompts[0]).toContain('fix typo');
  expect(await subjects('main..feature-s1')).toBe('Add the table');
  expect(await subjects('feature-s1..feature')).toBe('Add the CRUD');
  expect(
    await Promise.all(
      ['feature-s1', 'feature'].map((ref) => git(origin(), 'rev-parse', `${ref}^{tree}`)),
    ),
  ).toEqual(trees);
  expect(listSlices(db, ticketId).map((entry) => entry.tipSha)).toEqual([
    await git(origin(), 'rev-parse', 'feature-s1'),
    await git(origin(), 'rev-parse', 'feature'),
  ]);
  if (result.kind === 'ok') {
    expect(result.output).toContain('2 commits → 1 commit');
  }
  const pushed = db.select().from(schema.events).all();
  expect(pushed.some((event) => event.type === 'branch_pushed')).toBe(true);
});

test('a change moved to another slice is sent back, then fails with the stack put back', async () => {
  const before = await git(origin(), 'rev-parse', 'feature');
  const lower = await git(origin(), 'rev-parse', 'feature-s1');
  const result = await run(merges);
  expect(result.kind).toBe('error');
  if (result.kind === 'error') {
    expect(result.error).toContain('Slice 1 (Migration) ends at');
  }
  // The first try and two rounds of fixes.
  expect(prompts).toHaveLength(3);
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(before);
  expect(await git(origin(), 'rev-parse', 'feature-s1')).toBe(lower);
  expect(await git(container(), 'rev-parse', 'HEAD')).toBe(before);
  expect(await git(container(), 'rev-parse', 'feature-s1')).toBe(lower);
});

test('a slice merged and not restacked yet refuses the simplification', async () => {
  db.update(schema.ticketSlices)
    .set({ prState: 'merged', mergedInto: 'main', mergedTipSha: 'abc' })
    .where(eq(schema.ticketSlices.position, 1))
    .run();
  const result = await run(folds);
  expect(result).toMatchObject({ kind: 'error' });
  expect(prompts).toEqual([]);
});
