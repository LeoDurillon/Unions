import { afterEach, beforeEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  latestAgentReview,
  migrateDb,
  queueAgentReview,
  schema,
  type AgentReviewOwner,
  type AgentReviewSpec,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';

import type { AgentFn, AgentRun } from './agent';
import { AgentReviewRunner } from './agent-review';
import { REPO_DIR } from './provision';
import { RunSlots } from './slots';

const PATCH = '@@ -1,2 +1,2 @@\n const a = 1;\n-const b = 2;\n+const b = 3;';

let root: string;
let db: Db;
let projectId: number;
let runs: AgentRun[];
let removed: string[];
let reply: string;

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

/** Every command succeeds silently; the repository a pull request is copied into lands in `root`. */
const runtime = {
  create: () => Promise.resolve(),
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  isRunning: () => Promise.resolve(true),
  writeFile: () => Promise.resolve(),
  remove: (name: string) => {
    removed.push(name);
    return Promise.resolve();
  },
  async copyIn(_name: string, hostDir: string, containerDir: string): Promise<void> {
    expect(containerDir).toBe(REPO_DIR);
    await cp(hostDir, path.join(root, 'copied'), { recursive: true });
  },
  // The commands print nothing and succeed.
  *exec(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
  // No project files: the workspace check finds nothing to do.
  *runHelper(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const agent: AgentFn = (_runtime, run) => {
  runs.push(run);
  return Promise.resolve({ kind: 'ok', text: reply, sessionId: 's', costUsd: null });
};

function answer(comments: unknown[], summary = ''): string {
  return `Done.\n\n\`\`\`json\n${JSON.stringify({ summary, comments })}\n\`\`\``;
}

async function review(
  owner: AgentReviewOwner,
  specs: AgentReviewSpec[] | null = null,
): Promise<void> {
  queueAgentReview(db, owner, specs);
  const runner = new AgentReviewRunner({
    db,
    runtime,
    config: {
      image: 'i',
      gitBaseUrl: `file://${root}`,
      credentialsPath: path.join(root, 'credentials.json'),
    },
    slots: new RunSlots(1),
    agent,
  });
  runner.tick();
  await runner.idle();
}

function savedDrafts(): { kind: string; excerpt: string; body: string; headSha: string }[] {
  return db
    .select()
    .from(schema.reviewComments)
    .all()
    .map(({ kind, excerpt, body, headSha }) => ({ kind, excerpt, body, headSha }));
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-agent-review-'));
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
  runs = [];
  removed = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("a ticket's review comments on its latest diff, in the ticket's container", async () => {
  const ticketId = createTicket(db, { projectId, title: 'Add search' }).id;
  db.update(schema.tickets).set({ branch: 'feature' }).run();
  const snapshot = db
    .insert(schema.diffSnapshots)
    .values({ ticketId, baseBranch: 'main', headSha: 'h1' })
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
      patch: PATCH,
    })
    .run();
  reply = answer([{ path: 'a.ts', side: 'new', startLine: 2, body: 'Why 3?' }], 'Mostly fine.');

  await review({ kind: 'ticket', id: ticketId });

  expect(runs[0]).toMatchObject({ container: 'union-t1', cwd: REPO_DIR, model: 'opus' });
  expect(runs[0]?.prompt).toContain('git diff main...HEAD');
  expect(runs[0]?.prompt).toContain('# Add search');
  expect(runs[0]?.prompt).toContain('"startLine"');
  expect(savedDrafts()).toEqual([
    { kind: 'general', excerpt: '', body: 'Mostly fine.', headSha: 'h1' },
    { kind: 'line', excerpt: 'const b = 3;', body: 'Why 3?', headSha: 'h1' },
  ]);
  expect(latestAgentReview(db, { kind: 'ticket', id: ticketId })).toMatchObject({
    status: 'succeeded',
    comments: 2,
  });
});

test("given specs, the agent reads them instead of the ticket's text", async () => {
  const ticketId = createTicket(db, { projectId, title: 'Add search', body: 'Search by name.' }).id;
  db.update(schema.tickets).set({ branch: 'feature' }).run();
  db.insert(schema.diffSnapshots).values({ ticketId, baseBranch: 'main', headSha: 'h1' }).run();
  reply = answer([]);

  await review({ kind: 'ticket', id: ticketId }, [
    { kind: 'issue', label: 'Issue #4: Search', text: 'Search by name and city.', prs: [] },
  ]);
  expect(runs[0]?.prompt).toContain('### Spec 1: Issue #4: Search\n\nSearch by name and city.');
  expect(runs[0]?.prompt).toContain('for the ticket "Add search"');
  expect(runs[0]?.prompt).not.toContain('Search by name.');

  await review({ kind: 'ticket', id: ticketId }, []);
  expect(runs[1]?.prompt).not.toContain('## Specifications');
  expect(runs[1]?.prompt).not.toContain('Search by name.');
});

test('an answer without the comments block fails the review and adds nothing', async () => {
  const ticketId = createTicket(db, { projectId, title: 't' }).id;
  db.update(schema.tickets).set({ branch: 'feature' }).run();
  db.insert(schema.diffSnapshots).values({ ticketId, baseBranch: 'main', headSha: 'h1' }).run();
  reply = 'Looks good to me.';
  await review({ kind: 'ticket', id: ticketId });
  expect(savedDrafts()).toEqual([]);
  expect(latestAgentReview(db, { kind: 'ticket', id: ticketId })?.error).toContain(
    'no comments block',
  );
});

test('a pull request is checked out at its reviewed commit in a container removed after', async () => {
  // GitHub's side: main, and the pull request's head under `refs/pull/7/head` (as for a fork).
  const origin = path.join(root, 'acme', 'shop.git');
  const seed = path.join(root, 'seed');
  await mkdir(path.dirname(origin), { recursive: true });
  await git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
  await git(root, 'clone', '--quiet', origin, seed);
  await writeFile(path.join(seed, 'a.ts'), 'const a = 1;\nconst b = 2;\n');
  await git(seed, 'add', '.');
  await git(seed, 'commit', '--quiet', '-m', 'init');
  await git(seed, 'push', '--quiet', 'origin', 'main');
  await writeFile(path.join(seed, 'a.ts'), 'const a = 1;\nconst b = 3;\n');
  await git(seed, 'commit', '--quiet', '-am', 'change b');
  const head = await git(seed, 'rev-parse', 'HEAD');
  await git(seed, 'push', '--quiet', 'origin', 'HEAD:refs/pull/7/head');
  const reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'Change b',
      url: 'u',
      author: 'someone',
      headBranch: 'fork-branch',
      baseBranch: 'main',
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
          patch: PATCH,
        },
      ],
    })
    .returning()
    .get().id;
  reply = answer([{ path: 'a.ts', side: 'new', startLine: 2, body: 'Why 3?' }]);

  await review({ kind: 'review', id: reviewId });

  const copied = path.join(root, 'copied');
  expect(await git(copied, 'rev-parse', 'HEAD')).toBe(head);
  expect(await git(copied, 'rev-parse', 'origin/main')).not.toBe(head);
  expect(runs[0]?.prompt).toContain('git diff origin/main...HEAD');
  expect(runs[0]?.prompt).toContain('Pull request #7 by someone');
  expect(removed).toEqual(['union-a1']);
  expect(savedDrafts()).toEqual([
    { kind: 'line', excerpt: 'const b = 3;', body: 'Why 3?', headSha: head },
  ]);
});
