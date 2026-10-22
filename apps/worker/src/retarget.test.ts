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
import type { GitHubApi, PullRequestState } from './github/api';
import { AGENT_HOME, REPO_DIR } from './provision';
import { runRetargetStep } from './retarget';

type StepContext = Parameters<typeof runRetargetStep>[1];
type StepResult = Awaited<ReturnType<typeof runRetargetStep>>;

const INBOX = '/tmp/union-fetch';
const PR = 7;

let root: string;
let db: Db;
let ticketId: number;
let runs: AgentRun[];
let retargeted: { number: number; base: string }[];
let prState: PullRequestState;
let prBase: string;
let refuseRetarget: boolean;
let developCommit: string;

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

/** Main, develop one commit ahead of it, and the ticket's branch on develop. */
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-retarget-'));
  await mkdir(path.dirname(origin()), { recursive: true });
  await git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin());
  await git(root, 'clone', '--quiet', origin(), seed());
  await commit(seed(), 'a.txt', 'one\n');
  await git(seed(), 'push', '--quiet', 'origin', 'main');
  await git(seed(), 'checkout', '--quiet', '-b', 'develop');
  await commit(seed(), 'd.txt', 'develop only\n');
  developCommit = await git(seed(), 'rev-parse', 'HEAD');
  await git(seed(), 'push', '--quiet', 'origin', 'develop');
  await git(seed(), 'checkout', '--quiet', '-b', 'fix');
  await commit(seed(), 'b.txt', 'the fix\n');
  await git(seed(), 'push', '--quiet', 'origin', 'fix');
  await git(root, 'clone', '--quiet', '--branch', 'fix', origin(), container());
  await git(container(), 'branch', '--quiet', 'develop', 'origin/develop');

  await writeFile(
    path.join(root, 'credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }),
  );
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'develop' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'Fix the cart' }).id;
  db.update(schema.tickets)
    .set({
      branch: 'fix',
      baseBranch: 'develop',
      retargetBranch: 'main',
      prNumber: PR,
      prState: 'open',
      phase: { kind: 'running', step: 'retarget', thenRun: 'final_review', thenDone: true },
    })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  runs = [];
  retargeted = [];
  prState = 'open';
  prBase = 'develop';
  refuseRetarget = false;
});

const github = {
  pullRequestStatus: () =>
    Promise.resolve({
      state: prState,
      behindBy: null,
      mergedAt: null,
      closedAt: null,
      base: prBase,
    }),
  updatePullRequestBase(_repo: unknown, number: number, base: string): Promise<void> {
    if (refuseRetarget) {
      return Promise.reject(new Error('Validation Failed'));
    }
    retargeted.push({ number, base });
    prBase = base;
    return Promise.resolve();
  },
  pullRequestBody: () => Promise.resolve('Fixes the cart.\n\nCloses #3'),
  updatePullRequestBody: () => Promise.resolve(),
} as unknown as GitHubApi;

const noAgent: AgentFn = (_runtime, agentRun) => {
  runs.push(agentRun);
  return Promise.resolve({ kind: 'error', message: 'not expected' });
};

function run(agent: AgentFn = noAgent): Promise<StepResult> {
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  if (!ticket) {
    throw new Error('ticket missing');
  }
  const context: StepContext = {
    ticket,
    step: 'retarget',
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
  return runRetargetStep({ db, runtime, config, github: () => github, agent }, context);
}

/** The commits the pushed branch has over main, newest first. */
function overMain(): Promise<string> {
  return git(origin(), 'log', '--format=%s', 'main..fix');
}

function ticketRow(): typeof schema.tickets.$inferSelect | undefined {
  return db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
}

test("a clean change of target moves only the branch's own commits, with no agent", async () => {
  const result = await run();
  expect(runs).toHaveLength(0);
  expect(result).toMatchObject({ kind: 'ok', clean: true });
  expect(result.kind === 'ok' && result.output).toContain('from `develop` to `main`');
  expect(await overMain()).toBe('edit b.txt');
  expect(retargeted).toEqual([{ number: PR, base: 'main' }]);
  expect(ticketRow()).toMatchObject({
    baseBranch: 'main',
    chosenBaseBranch: 'main',
    retargetBranch: null,
  });
  const files = db
    .select()
    .from(schema.diffFiles)
    .all()
    .map((file) => file.path);
  expect(files).toEqual(['b.txt']);
});

/** Main gets its own b.txt: the branch's commit conflicts with it. */
async function conflictOnMain(): Promise<void> {
  await git(seed(), 'checkout', '--quiet', 'main');
  await commit(seed(), 'b.txt', 'main version\n');
  await git(seed(), 'push', '--quiet', 'origin', 'main');
}

test('a conflict goes to the agent, told which commits move', async () => {
  await conflictOnMain();
  const result = await run(async (_runtime, agentRun) => {
    runs.push(agentRun);
    await git(container(), 'reset', '--quiet', '--hard', 'origin/main');
    await commit(container(), 'b.txt', 'main version\nthe fix\n');
    return { kind: 'ok', text: 'Resolved b.txt.', sessionId: 's2' };
  });
  expect(runs).toHaveLength(1);
  expect(runs[0]?.prompt).toContain(`git rebase --onto origin/main ${developCommit}`);
  expect(result).toMatchObject({ kind: 'ok', sessionId: 's2' });
  expect(result.kind === 'ok' && result.clean).toBeFalsy();
  expect(await overMain()).toBe('edit b.txt');
  expect(retargeted).toEqual([{ number: PR, base: 'main' }]);
});

test("an agent that brings the old base's commits along is refused, nothing pushed", async () => {
  await conflictOnMain();
  const pushed = await git(origin(), 'rev-parse', 'fix');
  const result = await run(async (_runtime, agentRun) => {
    runs.push(agentRun);
    await git(container(), 'reset', '--quiet', '--hard', 'origin/main');
    await git(container(), 'cherry-pick', developCommit);
    await commit(container(), 'b.txt', 'main version\nthe fix\n');
    return { kind: 'ok', text: 'Done.', sessionId: 's2' };
  });
  expect(result).toMatchObject({ kind: 'error' });
  expect(result.kind === 'error' && result.error).toContain('came along');
  expect(await git(origin(), 'rev-parse', 'fix')).toBe(pushed);
  expect(retargeted).toHaveLength(0);
  expect(ticketRow()?.retargetBranch).toBe('main');
});

test('when GitHub refuses the new base, a retry only retargets', async () => {
  refuseRetarget = true;
  const failed = await run();
  expect(failed).toMatchObject({ kind: 'error' });
  expect(await overMain()).toBe('edit b.txt');
  expect(ticketRow()?.baseBranch).toBe('develop');
  refuseRetarget = false;
  const pushed = await git(origin(), 'rev-parse', 'fix');
  const result = await run();
  expect(result).toMatchObject({ kind: 'ok', clean: true });
  expect(result.kind === 'ok' && result.output).toContain('Already up to date');
  expect(await git(origin(), 'rev-parse', 'fix')).toBe(pushed);
  expect(retargeted).toEqual([{ number: PR, base: 'main' }]);
  expect(ticketRow()?.baseBranch).toBe('main');
});

test('a merged pull request, or a target that does not exist, is refused', async () => {
  prState = 'merged';
  expect(await run()).toMatchObject({ kind: 'error' });
  prState = 'open';
  db.update(schema.tickets)
    .set({ retargetBranch: 'hotfix' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  const missing = await run();
  expect(missing.kind === 'error' && missing.error).toContain('`hotfix`');
  expect(retargeted).toHaveLength(0);
});
