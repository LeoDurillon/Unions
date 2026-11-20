// Tests of a compaction run: `/compact` resumed in the implementer's session, and when it does not run.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  createTicket,
  latestSessionCompaction,
  migrateDb,
  queueSessionCompaction,
  schema,
  type ContainerRuntime,
  type Db,
  type ExecResult,
} from '@union/core';
import { eq } from 'drizzle-orm';

import type { AgentFn, AgentOutcome, AgentRun } from '../agent/agent';
import { RunSlots } from '../slots';
import { CompactionRunner } from './compaction-runner';

let root: string;
let db: Db;
let ticketId: number;
let runs: AgentRun[];
let outcome: AgentOutcome;

/** Every command succeeds silently: the workspace exists. */
const runtime = {
  create: () => Promise.resolve(),
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  isRunning: () => Promise.resolve(true),
  writeFile: () => Promise.resolve(),
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
  return Promise.resolve(outcome);
};

async function compact(beforeRun?: () => void): Promise<void> {
  queueSessionCompaction(db, ticketId);
  beforeRun?.();
  const runner = new CompactionRunner({
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
  root = await mkdtemp(path.join(tmpdir(), 'union-compaction-'));
  await writeFile(
    path.join(root, 'credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }),
  );
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Add search', body: '' }).id;
  db.update(schema.tickets)
    .set({ branch: '12-add-search', phase: { kind: 'awaiting_approval', step: 'final_review' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  db.insert(schema.runs)
    .values({
      ticketId,
      step: 'implement',
      model: 'opus',
      status: 'succeeded',
      sessionId: 'impl-session',
    })
    .run();
  runs = [];
  outcome = { kind: 'ok', text: '', sessionId: 'impl-session' };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('resumes the implementer session with /compact', async () => {
  await compact();
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ prompt: '/compact', resumeSessionId: 'impl-session' });
  expect(latestSessionCompaction(db, ticketId)?.status).toBe('succeeded');
});

test('a failed call fails the compaction with its reason', async () => {
  outcome = { kind: 'error', message: 'No conversation found with session ID: impl-session' };
  await compact();
  expect(latestSessionCompaction(db, ticketId)).toMatchObject({
    status: 'failed',
    error: 'No conversation found with session ID: impl-session',
  });
});

test('a step started since it was queued: no agent runs', async () => {
  await compact(() => {
    db.update(schema.tickets)
      .set({ phase: { kind: 'running', step: 'implement' } })
      .where(eq(schema.tickets.id, ticketId))
      .run();
  });
  expect(runs).toHaveLength(0);
  expect(latestSessionCompaction(db, ticketId)?.error).toContain('A step started');
});
