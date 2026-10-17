import { afterEach, beforeEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  latestAgentReview,
  migrateDb,
  queueAgentReview,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentFn, AgentRun } from './agent';
import { AgentReviewRunner } from './agent-review';
import { RunSlots } from './slots';

let root: string;
let db: Db;
let projectId: number;
let runs: AgentRun[];
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

/** Every command succeeds silently; the checkout copied into the container lands in `root/copied`. */
const runtime = {
  create: () => Promise.resolve(),
  start: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  writeFile: () => Promise.resolve(),
  async copyIn(_name: string, hostDir: string): Promise<void> {
    await cp(hostDir, path.join(root, 'copied'), { recursive: true });
  },
  *exec(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const agent: AgentFn = (_runtime, run) => {
  runs.push(run);
  return Promise.resolve({ kind: 'ok', text: reply, sessionId: 's' });
};

const patch = (line: string): string => `@@ -1,1 +1,1 @@\n-old\n+${line}`;

/** GitHub's side: main, #12 on it and #13 on #12, each under `refs/pull/<n>/head`. */
async function seedStack(): Promise<{ sha12: string; sha13: string }> {
  const origin = path.join(root, 'acme', 'shop.git');
  const seed = path.join(root, 'seed');
  await mkdir(path.dirname(origin), { recursive: true });
  await git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
  await git(root, 'clone', '--quiet', origin, seed);
  await writeFile(path.join(seed, 'a.ts'), 'old\n');
  await git(seed, 'add', '.');
  await git(seed, 'commit', '--quiet', '-m', 'init');
  await git(seed, 'push', '--quiet', 'origin', 'main');
  const shas: string[] = [];
  for (const [number, line] of [
    [12, 'schema'],
    [13, 'api'],
  ] as const) {
    await writeFile(path.join(seed, 'a.ts'), `${line}\n`);
    await git(seed, 'commit', '--quiet', '-am', line);
    shas.push(await git(seed, 'rev-parse', 'HEAD'));
    await git(seed, 'push', '--quiet', 'origin', `HEAD:refs/pull/${number}/head`);
  }
  return { sha12: shas[0] ?? '', sha13: shas[1] ?? '' };
}

/** A pull request under review whose head branch is named after the line it writes. */
function addReview(prNumber: number, baseBranch: string, headSha: string, line: string): number {
  const file = {
    id: 1,
    path: 'a.ts',
    oldPath: 'a.ts',
    status: 'modified' as const,
    binary: false,
    additions: 1,
    deletions: 1,
    patch: patch(line),
  };
  return db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber,
      title: line,
      url: 'u',
      author: 'alice',
      headBranch: line,
      baseBranch,
      headSha,
      files: [file],
    })
    .returning()
    .get().id;
}

function draftsOf(reviewId: number): string[] {
  return db
    .select()
    .from(schema.reviewComments)
    .where(eq(schema.reviewComments.reviewId, reviewId))
    .all()
    .map((comment) => `${comment.kind}: ${comment.body}`);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-stack-review-'));
  await writeFile(
    path.join(root, 'credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }),
  );
  db = createDb(':memory:');
  migrateDb(db);
  runs = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("a stack's pull requests are checked out together and each gets the comments on its diff", async () => {
  const { sha12, sha13 } = await seedStack();
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const bottom = addReview(12, 'main', sha12, 'schema');
  const top = addReview(13, 'schema', sha13, 'api');
  const specs = [
    { kind: 'issue' as const, label: 'Issue #4', text: 'An API on a schema.', prs: [12, 13] },
  ];
  queueAgentReview(db, { kind: 'review', id: bottom }, specs, [bottom, top]);
  reply = `Done.\n\n\`\`\`json\n${JSON.stringify({
    summary: 'The split is sound.',
    comments: [
      { pr: 12, path: 'a.ts', side: 'new', startLine: 1, body: 'Name it schema_v1?' },
      { pr: 13, path: 'a.ts', side: 'new', startLine: 1, body: 'Undoes the schema line.' },
      { pr: 99, path: 'b.ts', side: 'new', startLine: 3, body: 'Elsewhere.' },
    ],
  })}\n\`\`\``;

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

  const copied = path.join(root, 'copied');
  expect(await git(copied, 'rev-parse', 'HEAD')).toBe(sha13);
  expect(await git(copied, 'rev-parse', 'refs/union/pr-12')).toBe(sha12);
  const prompt = runs[0]?.prompt ?? '';
  expect(prompt).toContain('A stack of 2 pull requests');
  expect(prompt).toContain('git diff origin/main...refs/union/pr-12');
  expect(prompt).toContain('git diff refs/union/pr-12...refs/union/pr-13');
  expect(prompt).toContain('Its specs: 1.');
  expect(prompt).toContain('### Spec 1: Issue #4 (implemented by #12, #13)');
  expect(prompt).toContain('`pr`');
  expect(draftsOf(bottom)).toEqual(['line: Name it schema_v1?']);
  expect(draftsOf(top)).toEqual([
    'general: The split is sound.',
    'line: Undoes the schema line.',
    'general: **b.ts**, line 3:\n\nAbout #99: Elsewhere.',
  ]);
  expect(latestAgentReview(db, { kind: 'review', id: top })).toMatchObject({
    status: 'succeeded',
    comments: 4,
  });
});
