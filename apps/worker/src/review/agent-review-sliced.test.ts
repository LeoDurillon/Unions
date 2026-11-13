// Tests a sliced agent review end to end with a fake agent: the cut, one run per slice, the seams, the merge.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  latestAgentReview,
  migrateDb,
  queueAgentReview,
  schema,
  type AgentReviewSpec,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';

import type { AgentFn, AgentRun } from '../agent/agent';
import { RunSlots } from '../slots';
import { AgentReviewRunner } from './agent-review';

let root: string;
let db: Db;
let ticketId: number;
let runs: AgentRun[];
let failPart: number | null;

const runtime = {
  create: () => Promise.resolve(),
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  isRunning: () => Promise.resolve(true),
  writeFile: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  *exec(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
  *runHelper(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

function block(value: unknown): string {
  return `Done.\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
}

function comment(file: string, line: number, body: string): unknown {
  return { path: file, side: 'new', startLine: line, body };
}

/** Answers each agent by what its prompt asks: the grouping, a part, or the seams. */
function replyTo(prompt: string): string {
  if (prompt.includes('"groups"')) {
    return block({
      groups: [
        { title: 'Search', spec: 'Search by name', summary: 's', files: ['web/b.ts'] },
        { title: 'Index', spec: 'Index names', summary: 'i', files: ['api/a.ts'] },
      ],
      unrelated: [],
      missing: [{ spec: 'Search by city', note: 'nothing for it' }],
    });
  }
  const part = /You review part (?<n>\d+)/u.exec(prompt)?.groups?.n;
  if (part === undefined) {
    return block({ summary: 'Whole change fine.', comments: [comment('api/a.ts', 3, 'seam')] });
  }
  return Number(part) === failPart
    ? 'No block.'
    : block({
        summary: `part ${part}`,
        comments: [comment(part === '1' ? 'api/a.ts' : 'web/b.ts', 3, `from ${part}`)],
      });
}

const agent: AgentFn = (_runtime, run) => {
  runs.push(run);
  return Promise.resolve({ kind: 'ok', text: replyTo(run.prompt), sessionId: 's' });
};

/** A patch adding `count` lines. */
function added(count: number): string {
  const lines = Array.from({ length: count }, (_, index) => `+line ${index + 1}`);
  return `@@ -0,0 +1,${count} @@\n${lines.join('\n')}`;
}

async function review(specs: AgentReviewSpec[] | null = null): Promise<void> {
  queueAgentReview(db, { kind: 'ticket', id: ticketId }, specs, { mode: 'sliced' });
  const runner = new AgentReviewRunner({
    db,
    runtime,
    config: { image: 'i', gitBaseUrl: 'file:///x', credentialsPath: path.join(root, 'c.json') },
    slots: new RunSlots(1),
    agent,
  });
  runner.tick();
  await runner.idle();
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-sliced-review-'));
  await writeFile(
    path.join(root, 'c.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }),
  );
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Add search' }).id;
  db.update(schema.tickets).set({ branch: 'feature' }).run();
  const snapshot = db
    .insert(schema.diffSnapshots)
    .values({ ticketId, baseBranch: 'main', headSha: 'h1' })
    .returning()
    .get();
  const file = (position: number, filePath: string): typeof schema.diffFiles.$inferInsert => ({
    snapshotId: snapshot.id,
    position,
    path: filePath,
    oldPath: filePath,
    status: 'added' as const,
    binary: false,
    additions: 600,
    deletions: 0,
    patch: added(600),
  });
  db.insert(schema.diffFiles)
    .values([file(0, 'api/a.ts'), file(1, 'web/b.ts')])
    .run();
  runs = [];
  failPart = null;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('without specs, the change is cut by folder: one agent per part, then the seams', async () => {
  await review();
  expect(runs).toHaveLength(3);
  expect(runs[0]?.prompt).toContain('You review part 1: **api/a.ts**');
  expect(runs[1]?.prompt).toContain('You review part 2: **web/b.ts**');
  expect(runs[2]?.prompt).toContain('- `api/a.ts:3`: from 1');
  const saved = latestAgentReview(db, { kind: 'ticket', id: ticketId });
  expect(saved).toMatchObject({ status: 'succeeded', mode: 'sliced', comments: 3 });
  expect(saved?.slices?.map((slice) => [slice.title, slice.status, slice.comments])).toEqual([
    ['api/a.ts', 'succeeded', 1],
    ['web/b.ts', 'succeeded', 1],
    ['How the parts fit together', 'succeeded', 1],
  ]);
  const bodies = db
    .select()
    .from(schema.reviewComments)
    .all()
    .map((draft) => draft.body);
  expect(bodies[0]).toStartWith('Whole change fine.\n\nReviewed in 2 parts');
  expect(bodies[0]).toContain('The parts come from by folder.');
  // The seams agent's comment on line 3 of api/a.ts repeats part 1's: kept once.
  expect(bodies.slice(1)).toEqual(['from 1', 'from 2']);
});

test('with specs, a grouping cuts the change first, and a failed part does not fail the review', async () => {
  failPart = 2;
  await review([{ kind: 'issue', label: 'Issue', text: 'Search by name and city.', prs: [] }]);
  expect(runs).toHaveLength(4);
  expect(runs[1]?.prompt).toContain('You review part 1: **Search**');
  expect(runs[3]?.prompt).toContain('- Search by city: nothing for it');
  const saved = latestAgentReview(db, { kind: 'ticket', id: ticketId });
  expect(saved?.status).toBe('succeeded');
  expect(saved?.slices?.[1]).toMatchObject({ title: 'Index', status: 'failed' });
  const [summary] = db.select().from(schema.reviewComments).all();
  expect(summary?.body).toContain('- **Index**: not reviewed');
  expect(summary?.body).toContain('a new grouping by spec');
});
