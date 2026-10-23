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
import { runRetargetStep } from './retarget';

type StepContext = Parameters<typeof runRebaseStep>[1];
type GitHubApi = NonNullable<ReturnType<Parameters<typeof runRebaseStep>[0]['github']>>;
type StepResult = Awaited<ReturnType<typeof runRebaseStep>>;

const INBOX = '/tmp/union-fetch';
const PR = 7;
const PARENT_PR = 5;
const BUILDS_ON = 'Builds on #5, which it targets: merge that one first.';

let root: string;
let db: Db;
let ticketId: number;
let runs: AgentRun[];
let bodies: string[];
let retargeted: string[];

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
const seed = (): string => path.join(root, 'seed');

/**
 * Main; `parent` two commits on it (the second rewrites the first's file, so a squash of them
 * conflicts with either); the ticket's `child` on `parent`, cloned into the container.
 */
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-follow-'));
  await mkdir(path.dirname(origin()), { recursive: true });
  await git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin());
  await git(root, 'clone', '--quiet', origin(), seed());
  await commit(seed(), 'a.txt', 'one\n');
  await git(seed(), 'push', '--quiet', 'origin', 'main');
  await git(seed(), 'checkout', '--quiet', '-b', 'parent');
  await commit(seed(), 'p.txt', 'one\n');
  await commit(seed(), 'p.txt', 'one\ntwo\n');
  await git(seed(), 'push', '--quiet', 'origin', 'parent');
  await git(seed(), 'checkout', '--quiet', '-b', 'child');
  await commit(seed(), 'c.txt', 'the child\n');
  await git(seed(), 'push', '--quiet', 'origin', 'child');
  await git(root, 'clone', '--quiet', '--branch', 'child', origin(), container());
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
  setTicket({
    branch: 'child',
    baseBranch: 'main',
    leftBase: { branch: 'parent', prNumber: PARENT_PR },
    prNumber: PR,
    prState: 'open',
    phase: { kind: 'running', step: 'rebase', thenRun: 'final_review', thenDone: true },
  });
  runs = [];
  bodies = [];
  retargeted = [];
});

function setTicket(values: Partial<typeof schema.tickets.$inferInsert>): void {
  db.update(schema.tickets).set(values).where(eq(schema.tickets.id, ticketId)).run();
}

/** `parent` merged into main (squashed, or a merge commit), its pull ref kept, its branch deleted. */
async function mergeParent(how: 'squash' | 'merge'): Promise<void> {
  await git(seed(), 'checkout', '--quiet', 'main');
  if (how === 'squash') {
    await git(seed(), 'merge', '--quiet', '--squash', 'parent');
    await git(seed(), 'commit', '--quiet', '-m', 'Parent (#5)');
  } else {
    await git(seed(), 'merge', '--quiet', '--no-ff', '-m', 'Merge #5', 'parent');
  }
  await git(seed(), 'push', '--quiet', 'origin', 'main');
  const tip = await git(origin(), 'rev-parse', 'refs/heads/parent');
  await git(origin(), 'update-ref', `refs/pull/${PARENT_PR}/head`, tip);
  await git(origin(), 'update-ref', '-d', 'refs/heads/parent');
}

const github = {
  pullRequestStatus: () =>
    Promise.resolve({
      state: 'open',
      behindBy: null,
      mergedAt: null,
      closedAt: null,
      base: 'main',
    }),
  mergedPullRequest: (_repo: unknown, branch: string) =>
    Promise.resolve(branch === 'parent' ? PARENT_PR : null),
  updatePullRequestBase(_repo: unknown, _number: number, base: string): Promise<void> {
    retargeted.push(base);
    return Promise.resolve();
  },
  pullRequestBody: () => Promise.resolve(`The child.\n\n${BUILDS_ON}\n\nCloses #3`),
  updatePullRequestBody(_repo: unknown, _number: number, body: string): Promise<void> {
    bodies.push(body);
    return Promise.resolve();
  },
} as unknown as GitHubApi;

const noAgent: AgentFn = (_runtime, agentRun) => {
  runs.push(agentRun);
  return Promise.resolve({ kind: 'error', message: 'not expected' });
};

function ticketRow(): typeof schema.tickets.$inferSelect {
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  if (!ticket) {
    throw new Error('ticket missing');
  }
  return ticket;
}

function run(step: 'rebase' | 'retarget' = 'rebase'): Promise<StepResult> {
  const context: StepContext = {
    ticket: ticketRow(),
    step,
    revision: null,
    resumeSessionId: null,
    log: () => {
      // not checked
    },
    signal: new AbortController().signal,
    resume: null,
  };
  const config = {
    image: 'i',
    gitBaseUrl: `file://${root}`,
    credentialsPath: path.join(root, 'credentials.json'),
  };
  const deps = { db, runtime, config, github: () => github, agent: noAgent };
  return step === 'rebase' ? runRebaseStep(deps, context) : runRetargetStep(deps, context);
}

/** The commits the pushed branch has over main, newest first. */
function overMain(): Promise<string> {
  return git(origin(), 'log', '--format=%s', 'main..child');
}

test("after a squash merge, the rebase moves only the ticket's commits, read from the pull ref", async () => {
  await mergeParent('squash');
  await git(container(), 'update-ref', '-d', 'refs/remotes/origin/parent');
  const result = await run();
  expect(runs).toHaveLength(0);
  expect(result).toMatchObject({ kind: 'ok', clean: true });
  expect(result.kind === 'ok' && result.output).toContain('Left `parent` behind');
  expect(await overMain()).toBe('edit c.txt');
  expect(ticketRow().leftBase).toBeNull();
  expect(bodies).toEqual(['The child.\n\nCloses #3']);
});

test('after a merge commit, the same move', async () => {
  await mergeParent('merge');
  expect(await run()).toMatchObject({ kind: 'ok', clean: true });
  expect(await overMain()).toBe('edit c.txt');
});

test("with no merged pull request, the workspace's last copy of the left base serves", async () => {
  await mergeParent('squash');
  setTicket({ leftBase: { branch: 'parent', prNumber: null } });
  expect(await run()).toMatchObject({ kind: 'ok', clean: true });
  expect(await overMain()).toBe('edit c.txt');
});

test('with no trace of the left base anywhere, a plain rebase runs', async () => {
  await mergeParent('merge');
  setTicket({ leftBase: { branch: 'parent', prNumber: null } });
  await git(container(), 'update-ref', '-d', 'refs/remotes/origin/parent');
  expect(await run()).toMatchObject({ kind: 'ok', clean: true });
  expect(await overMain()).toBe('edit c.txt');
  expect(ticketRow().leftBase).toBeNull();
});

test('a change of target can leave a base deleted after its merge', async () => {
  await mergeParent('squash');
  setTicket({
    baseBranch: 'parent',
    leftBase: null,
    retargetBranch: 'main',
    phase: { kind: 'running', step: 'retarget', thenRun: 'final_review', thenDone: true },
  });
  const result = await run('retarget');
  expect(result).toMatchObject({ kind: 'ok', clean: true });
  expect(await overMain()).toBe('edit c.txt');
  expect(retargeted).toEqual(['main']);
  expect(ticketRow()).toMatchObject({ baseBranch: 'main', retargetBranch: null });
});
