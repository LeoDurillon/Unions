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

import type { AgentFn, AgentRun } from './agent';
import { AGENT_HOME, REPO_DIR } from './provision';
import { runRebaseStep } from './rebase';
import type { StepContext, StepResult } from './scheduler';

const INBOX = '/tmp/union-fetch';

let root: string;
let db: Db;
let ticketId: number;
let agentCalls: number;
let runs: AgentRun[];

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
  runs = [];
});

/** Sets the project's check command; it runs in the workspace. */
function checks(command: string): void {
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main', gateCommand: command } })
    .run();
}

/** The agent fixes what the checks ask for: it adds the file they look for. */
const fixes: AgentFn = async (_runtime, agentRun) => {
  agentCalls += 1;
  runs.push(agentRun);
  await commit(container(), 'fixed.txt', 'fixed\n');
  return { kind: 'ok', text: 'Fixed the checks.', sessionId: 's2' };
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

test('a rebase with no conflict is pushed by git alone: no agent, the review stands', async () => {
  const before = await git(origin(), 'rev-parse', 'feature');
  const result = await run(fixes);
  expect(agentCalls).toBe(0);
  expect(result).toMatchObject({ kind: 'ok', clean: true });
  expect(result.kind === 'ok' && result.sessionId).toBeFalsy();
  expect(result.kind === 'ok' && result.output).toContain('with no conflict');
  expect(await git(origin(), 'rev-parse', 'feature')).not.toBe(before);
  await git(origin(), 'merge-base', '--is-ancestor', 'main', 'feature');
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  expect(ticket?.behindBy).toBe(0);
  const files = db
    .select()
    .from(schema.diffFiles)
    .all()
    .map((file) => file.path);
  expect(files).toEqual(['b.txt']);
});

test('a branch that already holds its base pushes nothing and runs no agent', async () => {
  await git(container(), 'fetch', '--quiet', 'origin');
  await git(container(), 'rebase', '--quiet', 'origin/main');
  await git(container(), 'push', '--quiet', '--force', 'origin', 'feature');
  const pushed = await git(origin(), 'rev-parse', 'feature');
  const result = await run(fixes);
  expect(agentCalls).toBe(0);
  expect(result).toMatchObject({ kind: 'ok', clean: true });
  expect(result.kind === 'ok' && result.output).toContain('Already up to date');
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushed);
});

test('checks that fail after a clean rebase go to the agent, on the rebased branch', async () => {
  checks(`test -f ${REPO_DIR}/fixed.txt`);
  let rebasedFirst = false;
  const result = await run(async (...args) => {
    rebasedFirst = await git(container(), 'merge-base', '--is-ancestor', 'origin/main', 'HEAD')
      .then(() => true)
      .catch(() => false);
    return fixes(...args);
  });
  expect(agentCalls).toBe(1);
  expect(rebasedFirst).toBe(true);
  expect(runs[0]?.prompt).toContain('without conflicts, but the checks');
  expect(result).toMatchObject({ kind: 'ok', sessionId: 's2' });
  expect(result.kind === 'ok' && result.clean).toBeFalsy();
  expect(await git(origin(), 'log', '-1', '--format=%s', 'feature')).toBe('edit fixed.txt');
  await git(origin(), 'merge-base', '--is-ancestor', 'main', 'feature');
});

test('when the agent cannot fix the checks, the branch goes back to before the rebase', async () => {
  checks(`test -f ${REPO_DIR}/fixed.txt`);
  const before = await git(container(), 'rev-parse', 'HEAD');
  const pushed = await git(origin(), 'rev-parse', 'feature');
  const result = await run(() => Promise.resolve({ kind: 'error', message: 'gave up' }));
  expect(result).toMatchObject({ kind: 'error' });
  expect(await git(container(), 'rev-parse', 'HEAD')).toBe(before);
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushed);
});

test("a clean rebase's run, which has no session, does not hide the implementer's", async () => {
  checks(`test -f ${REPO_DIR}/fixed.txt`);
  db.insert(schema.runs)
    .values([
      { ticketId, step: 'implement', model: 'opus', status: 'succeeded', sessionId: 's1' },
      { ticketId, step: 'rebase', model: 'opus', status: 'succeeded', sessionId: null },
    ])
    .run();
  await run(fixes);
  expect(runs[0]?.resumeSessionId).toBe('s1');
});
