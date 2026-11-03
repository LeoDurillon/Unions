import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  claimCustomAgentPrompt,
  createCustomAgent,
  createDb,
  createTicket,
  finishCustomAgentPrompt,
  latestReviewAgentRuns,
  migrateDb,
  queueReviewAgentRun,
  schema,
  type AgentReviewOwner,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';

import type { AgentFn, AgentRun } from './agent';
import { hostGit } from './provision';
import { ReviewAgentRunner } from './review-agent-run';
import { RunSlots } from './slots';

let root: string;
let db: Db;
let projectId: number;
let agentId: number;
let runs: AgentRun[];
/** What the throwaway container received, read before the host's copy is removed. */
let copied: { head: string; branches: string; origin: string }[];
let commands: string[];

async function git(dir: string, ...args: string[]): Promise<string> {
  const out = await hostGit(['-C', dir, ...args], null);
  return out.trim();
}

/** A repository with `main` and a `feature` commit on top, as the ticket's container has it. */
async function ticketRepo(dir: string): Promise<string> {
  await hostGit(['init', '--quiet', '--initial-branch', 'main', dir], null);
  await git(dir, 'config', 'user.email', 't@t');
  await git(dir, 'config', 'user.name', 't');
  await writeFile(path.join(dir, 'a.ts'), 'one\n');
  await git(dir, 'add', '.');
  await git(dir, 'commit', '--quiet', '-m', 'base');
  await git(dir, 'checkout', '--quiet', '-b', 'feature');
  await writeFile(path.join(dir, 'a.ts'), 'two\n');
  await git(dir, 'commit', '--quiet', '-am', 'Change a');
  return git(dir, 'rev-parse', 'HEAD');
}

function fakeRuntime(repo: string): ContainerRuntime {
  return {
    create: () => Promise.resolve(),
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    isRunning: () => Promise.resolve(true),
    writeFile: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    copyOut: async (_name: string, _from: string, hostPath: string) => {
      await git(repo, 'bundle', 'create', hostPath, 'refs/heads/feature', 'refs/heads/main');
    },
    copyIn: async (_name: string, dir: string) => {
      copied.push({
        head: await git(dir, 'rev-parse', 'HEAD'),
        branches: await git(dir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'),
        origin: await git(dir, 'remote', 'get-url', 'origin'),
      });
    },
    *runHelper(): Generator<string, ExecResult> {
      yield* [];
      return { exitCode: 0, stderr: '' };
    },
    *exec(_container: string, command: string[]): Generator<string, ExecResult> {
      commands.push(command.join(' '));
      yield* [];
      return { exitCode: 0, stderr: '' };
    },
  } as unknown as ContainerRuntime;
}

const agent: AgentFn = (_runtime, run) => {
  runs.push(run);
  return Promise.resolve({ kind: 'ok', text: '\nMergeable: see `a.ts:1`.\n', sessionId: 's' });
};

async function runOn(owner: AgentReviewOwner, runtime: ContainerRuntime): Promise<void> {
  queueReviewAgentRun(db, owner, agentId);
  const runner = new ReviewAgentRunner({
    db,
    runtime,
    config: { image: 'i', gitBaseUrl: root, credentialsPath: path.join(root, 'credentials.json') },
    slots: new RunSlots(1),
    agent,
  });
  runner.tick();
  await runner.idle();
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-review-agent-'));
  await writeFile(path.join(root, 'credentials.json'), JSON.stringify({ claudeAiOauth: {} }));
  runs = [];
  copied = [];
  commands = [];
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({
      owner: 'acme',
      repo: 'shop',
      config: { baseBranch: 'main', installCommand: 'bun i' },
    })
    .returning()
    .get().id;
  agentId = createCustomAgent(db, { name: 'Merge', role: 'Can it merge?', kind: 'review' }).id;
  claimCustomAgentPrompt(db);
  finishCustomAgentPrompt(db, agentId, { prompt: 'Say whether it can be merged.' });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("a ticket's branch is bundled from its container into a throwaway one, installed, then reviewed", async () => {
  const repo = path.join(root, 'ticket');
  const head = await ticketRepo(repo);
  const ticketId = createTicket(db, { projectId, title: 'Campaign' }).id;
  db.update(schema.tickets).set({ branch: 'feature' }).run();
  const snapshot = db
    .insert(schema.diffSnapshots)
    .values({ ticketId, baseBranch: 'main', headSha: head })
    .returning()
    .get();
  db.insert(schema.diffFiles)
    .values({
      snapshotId: snapshot.id,
      position: 0,
      path: 'a.ts',
      oldPath: 'a.ts',
      status: 'modified',
      binary: false,
      additions: 1,
      deletions: 1,
      patch: '@@ -1 +1 @@\n-one\n+two',
    })
    .run();
  await runOn({ kind: 'ticket', id: ticketId }, fakeRuntime(repo));

  expect(copied).toEqual([{ head, branches: 'feature\nmain', origin: `${root}/acme/shop.git` }]);
  expect(commands.some((command) => command.includes('bun i'))).toBe(true);
  expect(runs[0]?.container).toBe('union-v1');
  expect(runs[0]?.tools).toContain('Bash');
  expect(runs[0]?.prompt).toContain('Say whether it can be merged.');
  expect(runs[0]?.prompt).toContain(
    'The install command `bun i` ran in the checkout and succeeded.',
  );
  expect(runs[0]?.prompt).toContain('The review has no specs');
  expect(runs[0]?.prompt).toContain('`path:line`');
  const [run] = latestReviewAgentRuns(db, { kind: 'ticket', id: ticketId });
  expect(run).toMatchObject({
    status: 'succeeded',
    headSha: head,
    output: 'Mergeable: see `a.ts:1`.',
  });
});

test("a fork's pull request is cloned and read, but nothing of it is installed or run", async () => {
  const repo = path.join(root, 'ticket');
  const head = await ticketRepo(repo);
  const bare = path.join(root, 'acme', 'shop.git');
  await hostGit(['clone', '--quiet', '--bare', repo, bare], null);
  await git(bare, 'update-ref', 'refs/pull/7/head', head);
  const reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'PR',
      url: 'u',
      author: 'alice',
      headBranch: 'feature',
      baseBranch: 'main',
      fromFork: true,
      headSha: head,
      files: [
        {
          id: 1,
          path: 'a.ts',
          oldPath: 'a.ts',
          status: 'modified',
          binary: false,
          additions: 1,
          deletions: 1,
          patch: '@@ -1 +1 @@\n-one\n+two',
        },
      ],
    })
    .returning()
    .get().id;
  await runOn({ kind: 'review', id: reviewId }, fakeRuntime(repo));

  expect(copied[0]?.head).toBe(head);
  expect(commands.some((command) => command.includes('bun i'))).toBe(false);
  expect(runs[0]?.prompt).toContain('This pull request comes from a fork');
  expect(latestReviewAgentRuns(db, { kind: 'review', id: reviewId })[0]?.status).toBe('succeeded');
});
