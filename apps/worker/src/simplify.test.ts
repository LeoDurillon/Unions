import { beforeEach, expect, test } from 'bun:test';
import { chmod, cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  decideRefusal,
  latestRefusal,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentFn } from './agent';
import { AGENT_HOME, REPO_DIR } from './provision';
import type { StepContext, StepResult } from './scheduler';
import { runSimplifyStep } from './simplify';

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

async function commit(cwd: string, file: string, content: string, message?: string): Promise<void> {
  await writeFile(path.join(cwd, file), content);
  await git(cwd, 'add', file);
  await git(cwd, 'commit', '--quiet', '-m', message ?? `edit ${file}`);
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
  // No project files: the workspace check finds nothing to do.
  *runHelper(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const container = (): string => path.join(root, 'container');
const origin = (): string => path.join(root, 'acme', 'shop.git');

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-simplify-'));
  const seed = path.join(root, 'seed');
  await mkdir(path.dirname(origin()), { recursive: true });
  await git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin());
  await git(root, 'clone', '--quiet', origin(), seed);
  await commit(seed, 'a.txt', 'one\n');
  await git(seed, 'push', '--quiet', 'origin', 'main');
  // Three commits, one of them a fix-up of the first.
  await git(seed, 'checkout', '--quiet', '-b', 'feature');
  await commit(seed, 'b.txt', 'search\n', 'Add search');
  await commit(seed, 'b.txt', 'search, fixed\n', 'fix typo');
  await commit(seed, 'c.txt', 'tests\n', 'Test search');
  await git(seed, 'push', '--quiet', 'origin', 'feature');
  await git(root, 'clone', '--quiet', '--branch', 'feature', origin(), container());
  await git(container(), 'branch', '--quiet', 'main', 'origin/main');
  // Main moves on: the simplification must not follow it.
  await git(seed, 'checkout', '--quiet', 'main');
  await commit(seed, 'd.txt', 'upstream\n');
  await git(seed, 'push', '--quiet', 'origin', 'main');

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
  ticketId = createTicket(db, { projectId: project.id, title: 'Add search' }).id;
  db.update(schema.tickets)
    .set({ branch: 'feature', prState: 'open' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  prompts = [];
});

/** An agent that runs `change` in the workspace and reports. */
function agentDoing(change: (fork: string) => Promise<unknown>): AgentFn {
  return async (_runtime, agentRun) => {
    prompts.push(agentRun.prompt);
    await change(await git(container(), 'merge-base', 'HEAD', 'origin/main'));
    return { kind: 'ok', text: 'Folded the typo fix.', sessionId: 's3' };
  };
}

/** Folds the fix-up into the first commit, keeping the test commit apart. */
const folds = agentDoing(async (fork) => {
  await git(container(), 'reset', '--quiet', fork);
  await git(container(), 'add', 'b.txt');
  await git(container(), 'commit', '--quiet', '-m', 'Add search');
  await git(container(), 'add', 'c.txt');
  await git(container(), 'commit', '--quiet', '-m', 'Test search');
});

function run(agent: AgentFn, resume: StepContext['resume'] = null): Promise<StepResult> {
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  if (!ticket) {
    throw new Error('ticket missing');
  }
  const context: StepContext = {
    ticket,
    step: 'simplify',
    revision: null,
    resumeSessionId: null,
    log: () => {
      // not checked
    },
    signal: new AbortController().signal,
    resume,
  };
  return runSimplifyStep(
    {
      db,
      runtime,
      config: {
        image: 'i',
        gitBaseUrl: `file://${root}`,
        credentialsPath: path.join(root, 'credentials.json'),
      },
      github: () => null,
      agent,
    },
    context,
  );
}

const subjects = (ref: string): Promise<string> =>
  git(origin(), 'log', '--format=%s', `main~1..${ref}`);

test('the folded history is force-pushed with the same content, on the same fork point', async () => {
  const tree = await git(origin(), 'rev-parse', 'feature^{tree}');
  const fork = await git(origin(), 'rev-parse', 'main~1');
  const result = await run(folds);
  expect(result).toMatchObject({ kind: 'ok', sessionId: 's3' });
  expect(result.kind === 'ok' && result.output).toContain('from 3 commits to 2 commits');
  expect(prompts[0]).toContain(`at \`${fork}\` (the fork point)`);
  expect(await subjects('feature')).toBe('Test search\nAdd search');
  expect(await git(origin(), 'rev-parse', 'feature^{tree}')).toBe(tree);
  expect(await git(origin(), 'merge-base', 'main', 'feature')).toBe(fork);
  const events = db.select().from(schema.events).all();
  expect(events.find((event) => event.type === 'branch_pushed')?.payload).toEqual({
    branch: 'feature',
    simplified: true,
  });
});

test('a history that changes the code is refused: put back as it was, nothing pushed', async () => {
  const before = await git(container(), 'rev-parse', 'HEAD');
  const pushed = await git(origin(), 'rev-parse', 'feature');
  const edits = agentDoing(async (fork) => {
    await git(container(), 'reset', '--quiet', '--soft', fork);
    await commit(container(), 'b.txt', 'search, rewritten\n', 'Add search');
  });
  const result = await run(edits);
  expect(result.kind === 'error' && result.error).toContain('exactly the same files');
  expect(result.kind === 'error' && result.error).toContain('Folded the typo fix.');
  expect(await git(container(), 'rev-parse', 'HEAD')).toBe(before);
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushed);
});

test('moving the branch onto the newer base is refused: that is a rebase', async () => {
  const pushed = await git(origin(), 'rev-parse', 'feature');
  const rebases = agentDoing(() => git(container(), 'rebase', '--quiet', 'origin/main'));
  const result = await run(rebases);
  expect(result.kind === 'error' && result.error).toContain('moving it is a rebase');
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushed);
});

test("changes left uncommitted are committed with the agent's message, then refused if they change the code", async () => {
  const pushed = await git(origin(), 'rev-parse', 'feature');
  const leaves: AgentFn = async (_runtime, agentRun) => {
    if (agentRun.prompt.startsWith('You left changes uncommitted')) {
      return { kind: 'ok', text: 'Refused commit: Tidy', sessionId: 's3' };
    }
    await writeFile(path.join(container(), 'b.txt'), 'stray\n');
    return { kind: 'ok', text: 'Done.', sessionId: 's3' };
  };
  const result = await run(leaves);
  expect(result.kind === 'error' && result.error).toContain('exactly the same files');
  expect(await git(container(), 'status', '--porcelain')).toBe('');
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushed);
});

test('a history the agent leaves as it is pushes nothing', async () => {
  const pushed = await git(origin(), 'rev-parse', 'feature');
  const result = await run(agentDoing(() => Promise.resolve()));
  expect(result.kind === 'ok' && result.output).toContain('History unchanged');
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushed);
  const events = db.select().from(schema.events).all();
  expect(events.some((event) => event.type === 'branch_pushed')).toBe(false);
});

/** Folds the fix-up, then a hook refuses the second commit: the agent stops and names it. */
const refused: AgentFn = async (_runtime, agentRun) => {
  prompts.push(agentRun.prompt);
  const fork = await git(container(), 'merge-base', 'HEAD', 'origin/main');
  await git(container(), 'reset', '--quiet', fork);
  await git(container(), 'add', 'b.txt');
  await git(container(), 'commit', '--quiet', '-m', 'Add search');
  const hook = path.join(container(), '.git', 'hooks', 'pre-commit');
  await writeFile(hook, '#!/bin/sh\necho "lint: 2 warnings"\nexit 1\n');
  await chmod(hook, 0o755);
  return { kind: 'ok', text: 'Refused commit: Test search', sessionId: 's3' };
};

test('a commit a hook refuses pauses it unpushed; committing without hooks pushes it', async () => {
  const tree = await git(origin(), 'rev-parse', 'feature^{tree}');
  const pushed = await git(origin(), 'rev-parse', 'feature');
  const paused = await run(refused);
  expect(paused.kind).toBe('commit_refused');
  expect(prompts[0]).toContain('Refused commit: <the commit message you wanted>');
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushed);
  expect(latestRefusal(db, ticketId)).toMatchObject({ step: 'simplify', files: ['c.txt'] });

  decideRefusal(db, ticketId, { resolution: 'commit', message: 'Test search' });
  const resumed = await run(refused, 'commit');
  expect(resumed).toMatchObject({ kind: 'ok', sessionId: 's3' });
  expect(resumed.kind === 'ok' && resumed.output).toContain('from 3 commits to 2 commits');
  expect(prompts).toHaveLength(1);
  expect(await subjects('feature')).toBe('Test search\nAdd search');
  expect(await git(origin(), 'rev-parse', 'feature^{tree}')).toBe(tree);
});

test('keeping the old history after a refused commit puts the branch back, unpushed', async () => {
  const before = await git(container(), 'rev-parse', 'HEAD');
  const pushed = await git(origin(), 'rev-parse', 'feature');
  expect((await run(refused)).kind).toBe('commit_refused');
  decideRefusal(db, ticketId, { resolution: 'discard' });
  const resumed = await run(refused, 'discard');
  expect(resumed.kind === 'ok' && resumed.output).toContain('History kept');
  expect(await git(container(), 'rev-parse', 'HEAD')).toBe(before);
  expect(await git(container(), 'status', '--porcelain')).toBe('');
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushed);
  expect(latestRefusal(db, ticketId)?.resolvedAt).not.toBeNull();
});
