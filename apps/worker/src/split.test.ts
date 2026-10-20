import { beforeEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  listSlices,
  migrateDb,
  saveOutput,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentFn } from './agent';
import { FakeGitHubApi } from './github/fake-api';
import { AGENT_HOME, REPO_DIR } from './provision';
import { runSplitStep } from './split';

const INBOX = '/tmp/union-fetch';
const PLAN = `## Slice 1: Migration

**Spec:** The invoices table.

## Slice 2: CRUD

**Spec:** Create and list invoices.
`;

let root: string;
let db: Db;
let ticketId: number;
let projectId: number;
let github: FakeGitHubApi;
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
  github = new FakeGitHubApi();
  const issue = await github.createIssue(
    { owner: 'acme', repo: 'shop' },
    { title: 'Invoices', body: '' },
  );
  const pull = await github.createPullRequest(
    { owner: 'acme', repo: 'shop' },
    { title: 'Invoices', body: 'Closes #1', head: 'feature', base: 'main' },
  );
  ticketId = createTicket(db, { projectId, title: 'Invoices' }).id;
  db.update(schema.tickets)
    .set({ branch: 'feature', prState: 'open', prNumber: pull.number, issueNumber: issue.number })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  saveOutput(db, ticketId, 'split_plan', PLAN);
  prompts = [];
});

function setGate(gateCommand: string): void {
  db.update(schema.projects)
    .set({ config: { baseBranch: 'main', gateCommand } })
    .where(eq(schema.projects.id, projectId))
    .run();
}

type Step = (fork: string, turn: number) => Promise<unknown>;

/** An agent that runs `change` in the workspace on each turn and reports. */
function agentDoing(change: Step): AgentFn {
  return async (_runtime, agentRun) => {
    prompts.push(agentRun.prompt);
    await change(await git(container(), 'merge-base', 'HEAD', 'origin/main'), prompts.length);
    return { kind: 'ok', text: 'Split in two.', sessionId: `s${prompts.length}` };
  };
}

/** The table first, then the CRUD, each commit naming its slice (or not, with `trailers` off). */
async function sliceIt(fork: string, trailers = true): Promise<void> {
  await git(container(), 'reset', '--quiet', fork);
  await git(container(), 'add', 'm.txt');
  await git(
    container(),
    'commit',
    '--quiet',
    '-m',
    trailers ? 'Add the table\n\nSlice: 1' : 'Add the table',
  );
  await git(container(), 'add', 'c.txt');
  await git(
    container(),
    'commit',
    '--quiet',
    '-m',
    trailers ? 'Add the CRUD\n\nSlice: 2' : 'Add the CRUD',
  );
}

type StepContext = Parameters<typeof runSplitStep>[1];

function run(agent: AgentFn): ReturnType<typeof runSplitStep> {
  const ticket = db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).get();
  if (!ticket) {
    throw new Error('ticket missing');
  }
  const context: StepContext = {
    ticket,
    step: 'split',
    revision: null,
    resumeSessionId: null,
    log: () => {
      // not checked
    },
    signal: new AbortController().signal,
    resume: null,
  };
  return runSplitStep(
    {
      db,
      runtime,
      config: {
        image: 'i',
        gitBaseUrl: `file://${root}`,
        credentialsPath: path.join(root, 'credentials.json'),
      },
      github: () => github,
      agent,
    },
    context,
  );
}

test('the slices are pushed together and opened as a stack on the ticket pull request', async () => {
  const tree = await git(origin(), 'rev-parse', 'feature^{tree}');
  const result = await run(agentDoing((fork) => sliceIt(fork)));
  expect(result).toMatchObject({ kind: 'ok', sessionId: 's1' });
  expect(prompts[0]).toContain('# Approved split plan');
  expect(await git(origin(), 'log', '--format=%s', 'main..feature-s1')).toBe('Add the table');
  expect(await git(origin(), 'log', '--format=%s', 'feature-s1..feature')).toBe('Add the CRUD');
  expect(await git(origin(), 'rev-parse', 'feature^{tree}')).toBe(tree);
  const [, ticketPull, lower] = [undefined, ...github.pulls];
  expect(ticketPull).toMatchObject({ head: 'feature', base: 'feature-s1' });
  expect(ticketPull?.body).toContain('Closes #1');
  expect(ticketPull?.body).toContain('2. **#2 CRUD** (this pull request)');
  expect(lower).toMatchObject({
    head: 'feature-s1',
    base: 'main',
    title: 'Migration',
    draft: true,
  });
  expect(lower?.body).toContain('The invoices table.');
  expect(lower?.body).toContain('Part of #1.');
  expect(github.issues[0]?.comments.map((comment) => comment.body)).toEqual([
    'Split into a stack: #3 Migration → #2 CRUD',
  ]);
  const slices = listSlices(db, ticketId);
  expect(slices.map((slice) => [slice.position, slice.branch, slice.prNumber])).toEqual([
    [1, 'feature-s1', 3],
    [2, 'feature', 2],
  ]);
  expect(result.kind === 'ok' && result.output).toContain('**Split** into 2 slices');
  expect([...(github.stacks ?? [])]).toEqual([[1, [3, 2]]]);
  expect(db.select().from(schema.tickets).get()?.githubStackNumber).toBe(1);
});

test('commits without their slice go back to the agent, which fixes them in its session', async () => {
  const agent = agentDoing((fork, turn) => sliceIt(fork, turn > 1));
  const result = await run(agent);
  expect(result).toMatchObject({ kind: 'ok', sessionId: 's2' });
  expect(prompts[1]).toContain('has no `Slice:` trailer');
  expect(await git(origin(), 'log', '--format=%s', 'main..feature-s1')).toBe('Add the table');
});

test('a slice failing its checks alone is refused after the rounds: put back, nothing pushed', async () => {
  setGate(`test -f ${REPO_DIR}/c.txt`);
  const before = await git(container(), 'rev-parse', 'HEAD');
  const pushed = await git(origin(), 'rev-parse', 'feature');
  const result = await run(agentDoing((fork) => sliceIt(fork)));
  expect(result.kind === 'error' && result.error).toContain('Slice 1 fails the checks on its own');
  expect(prompts).toHaveLength(3);
  expect(await git(container(), 'rev-parse', 'HEAD')).toBe(before);
  expect(await git(origin(), 'rev-parse', 'feature')).toBe(pushed);
  expect(await git(origin(), 'branch', '--list', 'feature-s1')).toBe('');
  expect(github.pulls).toHaveLength(1);
});

test('a slice branch someone pushed to is refused before the agent runs', async () => {
  const other = path.join(root, 'other');
  await git(root, 'clone', '--quiet', '--branch', 'main', origin(), other);
  await commit(other, 'x.txt', 'theirs\n', 'Theirs');
  await git(other, 'push', '--quiet', 'origin', 'HEAD:refs/heads/feature-s1');
  const result = await run(agentDoing((fork) => sliceIt(fork)));
  expect(result.kind === 'error' && result.error).toContain('`feature-s1` on GitHub has commits');
  expect(prompts).toHaveLength(0);
});

test("a split run again reuses the slice's pull request, retitled, and replaces the GitHub stack", async () => {
  const old = await github.createPullRequest(
    { owner: 'acme', repo: 'shop' },
    { title: 'An older plan', body: '', head: 'feature-s1', base: 'feature' },
  );
  github.stacks?.set(1, [old.number, 2]);
  db.update(schema.tickets).set({ githubStackNumber: 1 }).run();
  const result = await run(agentDoing((fork) => sliceIt(fork)));
  expect(result).toMatchObject({ kind: 'ok' });
  expect(github.pullByNumber(old.number)).toMatchObject({ title: 'Migration', base: 'main' });
  expect(github.pulls).toHaveLength(2);
  expect(github.calls).toContain('unstack');
  expect([...(github.stacks ?? [])]).toEqual([[1, [old.number, 2]]]);
});
