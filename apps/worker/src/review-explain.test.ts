// Tests the explanation runner with a fake agent: answers, failures, follow-ups and the pull request container.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  explanationsOf,
  finishExplanation,
  migrateDb,
  queueExplanation,
  schema,
  type AgentReviewOwner,
  type ContainerRuntime,
  type Db,
  type ExecResult,
  type ExplanationRequest,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentFn, AgentOutcome, AgentRun } from './agent';
import { REPO_DIR } from './provision';
import { ReviewExplainRunner } from './review-explain';
import { RunSlots } from './slots';

const PATCH = '@@ -1,2 +1,2 @@\n const a = 1;\n-const b = 2;\n+const b = 3;';
const DOC = 'docs/spec/export.md';

let root: string;
let db: Db;
let projectId: number;
let ticket: AgentReviewOwner;
let runs: AgentRun[];
let removed: string[];
let replies: AgentOutcome[];

async function git(cwd: string, ...args: string[]): Promise<void> {
  const proc = Bun.spawn(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    stdout: 'ignore',
    stderr: 'pipe',
  });
  if ((await proc.exited) !== 0) {
    throw new Error(`git ${args.join(' ')}: ${await new Response(proc.stderr).text()}`);
  }
}

/** Every command succeeds; the docs check finds only `DOC`. */
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
  async copyIn(_name: string, hostDir: string): Promise<void> {
    await cp(hostDir, path.join(root, 'copied'), { recursive: true });
  },
  *exec(_name: string, command: string[]): Generator<string, ExecResult> {
    if (command[0] === 'sh' && command[2]?.includes('read -r p')) {
      yield DOC;
    }
    return { exitCode: 0, stderr: '' };
  },
  *runHelper(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const agent: AgentFn = (_runtime, run) => {
  runs.push(run);
  run.onEvent({ type: 'assistant', text: 'reading' });
  return Promise.resolve(replies.shift() ?? { kind: 'error', message: 'no reply left' });
};

function answer(block: unknown, sessionId = 's1'): AgentOutcome {
  return { kind: 'ok', text: `\`\`\`json\n${JSON.stringify(block)}\n\`\`\``, sessionId };
}

function ask(extra: Partial<ExplanationRequest> = {}): ExplanationRequest {
  return {
    path: 'a.ts',
    side: 'new',
    start: 2,
    end: 2,
    excerpt: 'const b = 3;',
    question: null,
    specs: [{ kind: 'pr', label: 'PR description', text: 'B becomes 3.', prs: [] }],
    headSha: 'h1',
    parentId: null,
    ...extra,
  };
}

async function drain(): Promise<void> {
  const runner = new ReviewExplainRunner({
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

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-explain-'));
  await writeFile(path.join(root, 'credentials.json'), JSON.stringify({ claudeAiOauth: {} }));
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  const { id } = createTicket(db, { projectId, title: 'Change b' });
  ticket = { kind: 'ticket', id };
  db.update(schema.tickets).set({ branch: 'feature' }).run();
  const snapshot = db
    .insert(schema.diffSnapshots)
    .values({ ticketId: id, baseBranch: 'main', headSha: 'h1' })
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
  runs = [];
  removed = [];
  replies = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('the agent gets the lines and specs; its checked answer and log are kept on the explanation', async () => {
  replies = [
    answer({
      explanation: 'Sets b, read by `a.ts:5`.',
      specs: [{ source: 'PR description', quote: 'B becomes 3', how: 'Here.' }],
      docs: [
        { path: DOC, heading: 'Limits', why: 'Says so.' },
        { path: 'docs/none.md', heading: '', why: '' },
      ],
    }),
  ];
  const explanation = queueExplanation(db, ticket, ask({ question: 'Why 3?' }));
  await drain();
  expect(runs[0]).toMatchObject({ container: 'union-t1', cwd: REPO_DIR, model: 'haiku' });
  expect(runs[0]?.prompt).toContain('`a.ts`, lines 2-2 at HEAD');
  expect(runs[0]?.prompt).toContain('### PR description\n\nB becomes 3.');
  expect(runs[0]?.prompt).toContain('## The question\n\nWhy 3?');
  expect(explanationsOf(db, ticket)[0]).toMatchObject({
    status: 'succeeded',
    sessionId: 's1',
    result: {
      explanation: 'Sets b, read by `a.ts:5`.',
      specs: [{ source: 'PR description', quote: 'B becomes 3' }],
      docs: [{ path: DOC }],
      dropped: 1,
    },
  });
  const lines = db.select().from(schema.agentLog).all();
  expect(lines.map((line) => [line.explanationId, line.ticketId])).toEqual([
    [explanation.id, ticket.id],
  ]);
});

test('an answer without the block fails, saying how it ended', async () => {
  replies = [{ kind: 'ok', text: 'It sets b.', sessionId: 's1' }];
  queueExplanation(db, ticket, ask());
  await drain();
  expect(explanationsOf(db, ticket)[0]).toMatchObject({ status: 'failed' });
  expect(explanationsOf(db, ticket)[0]?.error).toContain('no explanation block');
});

test('a follow-up resumes the session; a lost session runs again with the thread', async () => {
  const parent = queueExplanation(db, ticket, ask());
  db.update(schema.reviewExplanations)
    .set({ status: 'running' })
    .where(eq(schema.reviewExplanations.id, parent.id))
    .run();
  const first = { explanation: 'Sets b.', specs: [], docs: [] };
  finishExplanation(db, parent.id, {
    status: 'succeeded',
    result: { ...first, notInSpec: null, dropped: 0 },
    sessionId: 's1',
  });
  queueExplanation(db, ticket, ask({ parentId: parent.id, question: 'And a?' }));
  replies = [
    { kind: 'error', message: 'No conversation found with session ID: s1' },
    answer({ explanation: 'a stays 1.' }, 's2'),
  ];
  await drain();
  expect(runs[0]?.resumeSessionId).toBe('s1');
  expect(runs[0]?.prompt).toStartWith('A follow-up question on the same lines:\n\nAnd a?');
  expect(runs[1]?.resumeSessionId).toBeNull();
  expect(runs[1]?.prompt).toContain('## Earlier in this thread\n\n### Explain how');
  expect(runs[1]?.prompt).toContain('Sets b.');
  expect(explanationsOf(db, ticket)[0]).toMatchObject({ status: 'succeeded', sessionId: 's2' });
});

test("a pull request's explanation runs in a throwaway container, removed after", async () => {
  const origin = path.join(root, 'acme', 'shop.git');
  const seed = path.join(root, 'seed');
  await mkdir(path.dirname(origin), { recursive: true });
  await git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
  await git(root, 'clone', '--quiet', origin, seed);
  await writeFile(path.join(seed, 'a.ts'), 'const a = 1;\nconst b = 3;\n');
  await git(seed, 'add', '.');
  await git(seed, 'commit', '--quiet', '-m', 'init');
  await git(seed, 'push', '--quiet', 'origin', 'HEAD:main', 'HEAD:refs/pull/7/head');
  const proc = Bun.spawn(['git', 'rev-parse', 'HEAD'], { cwd: seed, stdout: 'pipe' });
  const head = (await new Response(proc.stdout).text()).trim();
  const reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'Change b',
      url: 'u',
      author: 'someone',
      headBranch: 'b',
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
  const owner: AgentReviewOwner = { kind: 'review', id: reviewId };
  replies = [answer({ explanation: 'Sets b.' })];
  const explanation = queueExplanation(db, owner, ask({ headSha: head }));
  await drain();
  expect(runs[0]?.container).toBe(`union-e${explanation.id}`);
  expect(runs[0]?.prompt).toContain('Pull request #7 by someone');
  expect(removed).toEqual([`union-e${explanation.id}`]);
  expect(explanationsOf(db, owner)[0]?.status).toBe('succeeded');
});
