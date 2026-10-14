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
import { runRebaseStep } from './rebase';
import type { StepContext, StepResult } from './scheduler';

const INBOX = '/tmp/union-fetch';

let root: string;
let db: Db;
let ticketId: number;
let agentCalls: number;

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
  // No project files: the workspace check finds nothing to do.
  *runHelper(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const container = (): string => path.join(root, 'container');
const origin = (): string => path.join(root, 'acme', 'shop.git');

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-rebase-'));
  const seed = path.join(root, 'seed');
  await mkdir(path.dirname(origin()), { recursive: true });
  await git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin());
  await git(root, 'clone', '--quiet', origin(), seed);
  await commit(seed, 'a.txt', 'one\n');
  await git(seed, 'push', '--quiet', 'origin', 'main');
  await git(seed, 'checkout', '--quiet', '-b', 'feature');
  await commit(seed, 'b.txt', 'feature\n');
  await git(seed, 'push', '--quiet', 'origin', 'feature');
  // The ticket's workspace: the branch as pushed, with the old main.
  await git(root, 'clone', '--quiet', '--branch', 'feature', origin(), container());
  await git(container(), 'branch', '--quiet', 'main', 'origin/main');
  // Main moves on after the branch was cut.
  await git(seed, 'checkout', '--quiet', 'main');
  await commit(seed, 'c.txt', 'upstream\n');
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
    .set({ branch: 'feature', behindBy: 1 })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  agentCalls = 0;
});

/** The agent does what the prompt asks, in the workspace: rebase onto origin/main. */
const rebases: AgentFn = async () => {
  agentCalls += 1;
  await git(container(), 'rebase', '--quiet', 'origin/main');
  return { kind: 'ok', text: 'Rebased cleanly.', sessionId: 's2', costUsd: null };
};

function run(agent: AgentFn, resume: StepContext['resume'] = null): Promise<StepResult> {
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  if (!ticket) {
    throw new Error('ticket missing');
  }
  const context: StepContext = {
    ticket,
    step: 'rebase',
    revision: null,
    resumeSessionId: null,
    log: () => {
      // not checked
    },
    signal: new AbortController().signal,
    resume,
  };
  return runRebaseStep(
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

test('the branch is rebased onto the fresh base, force-pushed and diffed again', async () => {
  const before = await git(origin(), 'rev-parse', 'feature');
  const result = await run(rebases);
  expect(result).toMatchObject({ kind: 'ok', sessionId: 's2' });
  expect(result.kind === 'ok' && result.output).toContain('Rebased cleanly.');

  const after = await git(origin(), 'rev-parse', 'feature');
  expect(after).not.toBe(before);
  // GitHub's branch now holds upstream's commit, and the local base moved too.
  await git(origin(), 'merge-base', '--is-ancestor', 'main', 'feature');
  expect(await git(container(), 'rev-parse', 'main')).toBe(
    await git(origin(), 'rev-parse', 'main'),
  );
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  expect(ticket?.behindBy).toBe(0);
  const files = db
    .select()
    .from(schema.diffFiles)
    .all()
    .map((file) => file.path);
  expect(files).toEqual(['b.txt']);
});

test('a rebase left half-done is undone: the branch is as it was and nothing is pushed', async () => {
  // A conflicting change on main: the agent's rebase stops on it and is left there.
  const seed = path.join(root, 'seed');
  await commit(seed, 'b.txt', 'upstream edit\n');
  await git(seed, 'push', '--quiet', 'origin', 'main');
  const before = await git(container(), 'rev-parse', 'HEAD');
  const pushedBefore = await git(origin(), 'rev-parse', 'feature');
  const stops: AgentFn = async () => {
    await git(container(), 'rebase', 'origin/main').catch(() => '');
    return { kind: 'ok', text: 'Conflict in b.txt.', sessionId: 's2', costUsd: null };
  };

  const result = await run(stops);
  expect(result).toMatchObject({ kind: 'error' });
  expect(result.kind === 'error' && result.error).toContain('left unfinished');
  expect(await git(container(), 'rev-parse', 'HEAD')).toBe(before);
  expect(await git(container(), 'status', '--porcelain')).toBe('');
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushedBefore);
});

test('commits on GitHub the workspace lacks stop the rebase before the agent runs', async () => {
  const other = path.join(root, 'other');
  await git(root, 'clone', '--quiet', '--branch', 'feature', origin(), other);
  await commit(other, 'd.txt', 'pushed by someone else\n');
  await git(other, 'push', '--quiet', 'origin', 'feature');

  const result = await run(rebases);
  expect(result.kind === 'error' && result.error).toContain('would drop them');
  expect(agentCalls).toBe(0);
});

test('a push made during the rebase is never overwritten: the lease refuses', async () => {
  const pushesMeanwhile: AgentFn = async (...args) => {
    const other = path.join(root, 'other');
    await git(root, 'clone', '--quiet', '--branch', 'feature', origin(), other);
    await commit(other, 'e.txt', 'late push\n');
    await git(other, 'push', '--quiet', 'origin', 'feature');
    return rebases(...args);
  };
  const result = await run(pushesMeanwhile);
  expect(result.kind === 'error' && result.error).toContain('push was refused');
  expect(await git(origin(), 'log', '--format=%s', '-1', 'feature')).toBe('edit e.txt');
});

test('a refused leftover commit pauses the rebase unpushed; the decision pushes it', async () => {
  const before = await git(origin(), 'rev-parse', 'feature');
  const hook = path.join(container(), '.git', 'hooks', 'pre-commit');
  await writeFile(hook, '#!/bin/sh\necho "lint: 2 warnings"\nexit 1\n');
  await chmod(hook, 0o755);
  const leavesAChange: AgentFn = async (...args) => {
    if (args[1].prompt.startsWith('You left changes uncommitted')) {
      return { kind: 'ok', text: 'Refused commit: 🎨 tidy b', sessionId: 's2', costUsd: null };
    }
    const outcome = await rebases(...args);
    await writeFile(path.join(container(), 'b.txt'), 'feature, tidied\n');
    return outcome;
  };
  const paused = await run(leavesAChange);
  expect(paused.kind).toBe('commit_refused');
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(before);
  // Not restored: the rebased branch waits with the refused change.
  await git(container(), 'merge-base', '--is-ancestor', 'origin/main', 'HEAD');
  expect(latestRefusal(db, ticketId)).toMatchObject({
    step: 'rebase',
    files: ['b.txt'],
    message: '🎨 tidy b',
  });

  decideRefusal(db, ticketId, { resolution: 'commit', message: 'tidy b' });
  const resumed = await run(leavesAChange, 'commit');
  expect(resumed).toMatchObject({ kind: 'ok', sessionId: 's2' });
  expect(agentCalls).toBe(1);
  expect(await git(origin(), 'log', '-1', '--format=%s', 'feature')).toBe('tidy b');
  await git(origin(), 'merge-base', '--is-ancestor', 'main', 'feature');
});
