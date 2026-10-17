import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  cancelQueuedGrouping,
  createDb,
  createTicket,
  GroupingBusyError,
  latestGrouping,
  migrateDb,
  queueGrouping,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';

import type { AgentFn, AgentRun } from './agent';
import { REPO_DIR } from './provision';
import { ReviewGroupingRunner } from './review-grouping';
import { parseGrouping } from './review-grouping-result';
import { RunSlots } from './slots';

let root: string;
let db: Db;
let ticketId: number;
let runs: AgentRun[];
let reply: string;

const runtime = {
  create: () => Promise.resolve(),
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  isRunning: () => Promise.resolve(true),
  writeFile: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  copyIn: () => Promise.resolve(),
  *exec(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
  *runHelper(): Generator<string, ExecResult> {
    yield* [];
    return { exitCode: 0, stderr: '' };
  },
} as unknown as ContainerRuntime;

const agent: AgentFn = (_runtime, run) => {
  runs.push(run);
  return Promise.resolve({ kind: 'ok', text: reply, sessionId: 's' });
};

function answer(block: unknown): string {
  return `Grouped.\n\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\``;
}

const SPEC = {
  kind: 'ticket' as const,
  label: 'Ticket description',
  spec: '- Unpublish\n- Tooltip',
};

async function group(): Promise<void> {
  queueGrouping(db, { kind: 'ticket', id: ticketId }, SPEC);
  const runner = new ReviewGroupingRunner({
    db,
    runtime,
    config: { image: 'i', gitBaseUrl: 'x', credentialsPath: path.join(root, 'credentials.json') },
    slots: new RunSlots(1),
    agent,
  });
  runner.tick();
  await runner.idle();
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-grouping-'));
  await writeFile(path.join(root, 'credentials.json'), JSON.stringify({ claudeAiOauth: {} }));
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Campaign' }).id;
  db.update(schema.tickets).set({ branch: 'feature' }).run();
  const snapshot = db
    .insert(schema.diffSnapshots)
    .values({ ticketId, baseBranch: 'main', headSha: 'h1' })
    .returning()
    .get();
  for (const [position, file] of ['api/activate.ts', 'ui/button.tsx', 'package.json'].entries()) {
    db.insert(schema.diffFiles)
      .values({
        snapshotId: snapshot.id,
        position,
        path: file,
        oldPath: file,
        status: 'modified',
        binary: false,
        additions: 1,
        deletions: 0,
        patch: '@@ -1 +1 @@\n+x',
      })
      .run();
  }
  runs = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('the agent reads the spec and the changed files, and its groups are kept on the change', async () => {
  reply = answer({
    groups: [
      { title: 'Unpublish', spec: 'Unpublish', summary: 'in activate', files: ['api/activate.ts'] },
    ],
    unrelated: [{ path: 'package.json', reason: 'bump' }],
    missing: [{ spec: 'Tooltip', note: 'no change' }],
  });
  await group();
  expect(runs[0]).toMatchObject({ container: 'union-t1', cwd: REPO_DIR, model: 'sonnet' });
  expect(runs[0]?.prompt).toContain('- Unpublish\n- Tooltip');
  expect(runs[0]?.prompt).toContain('- ui/button.tsx');
  expect(runs[0]?.prompt).toContain('git diff main...HEAD');
  expect(latestGrouping(db, { kind: 'ticket', id: ticketId })).toMatchObject({
    status: 'succeeded',
    headSha: 'h1',
    result: {
      groups: [{ key: 'unpublish', title: 'Unpublish', files: ['api/activate.ts'] }],
      unrelated: [
        { path: 'package.json', reason: 'bump' },
        { path: 'ui/button.tsx', reason: 'Not placed by the agent' },
      ],
      missing: [{ spec: 'Tooltip', note: 'no change' }],
    },
  });
});

test('an answer without a grouping block fails, saying how it ended', async () => {
  reply = 'I could not decide.';
  await group();
  const grouping = latestGrouping(db, { kind: 'ticket', id: ticketId });
  expect(grouping?.status).toBe('failed');
  expect(grouping?.error).toContain('no grouping block');
});

test('one grouping at a time per change; a new one replaces the old; a queued one can be cancelled', () => {
  const owner = { kind: 'ticket' as const, id: ticketId };
  const first = queueGrouping(db, owner, SPEC);
  expect(() => queueGrouping(db, owner, SPEC)).toThrow(GroupingBusyError);
  expect(cancelQueuedGrouping(db, first.id)).toBe(true);
  const second = queueGrouping(db, owner, SPEC);
  expect(
    db
      .select()
      .from(schema.reviewGroupings)
      .all()
      .map((row) => row.id),
  ).toEqual([second.id]);
});

test('the parser keeps only changed files, each at least once, and never an empty group', () => {
  const result = parseGrouping(
    answer({
      groups: [
        { title: 'Tooltip', files: ['ui/button.tsx', 'not/in/diff.ts', 'ui/button.tsx'] },
        { title: 'Tooltip', spec: 'again', files: ['api/activate.ts'] },
        { title: 'Logs', spec: 'Keep the publication log', files: ['nowhere.ts'] },
      ],
      unrelated: [{ path: 'ui/button.tsx', reason: 'already grouped' }],
    }),
    ['api/activate.ts', 'ui/button.tsx', 'package.json'].map((file) => ({ path: file, patch: '' })),
  );
  expect(result?.groups.map((entry) => [entry.key, entry.files])).toEqual([
    ['tooltip', ['ui/button.tsx']],
    ['tooltip-2', ['api/activate.ts']],
  ]);
  expect(result?.unrelated).toEqual([{ path: 'package.json', reason: 'Not placed by the agent' }]);
  expect(result?.missing).toEqual([
    { spec: 'Keep the publication log', note: 'No change placed under it' },
  ]);
  expect(parseGrouping('```json\n{"comments": []}\n```', [])).toBeNull();
});
