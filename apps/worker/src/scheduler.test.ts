import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  latestOutput,
  latestRefusal,
  migrateDb,
  saveOutput,
  schema,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { drainCommands } from './commands';
import { Scheduler, type StepExecutor, type StepResult } from './scheduler';

let db: Db;
let ticketId: number;

function command(type: string, payload?: unknown): void {
  db.insert(schema.commands)
    .values({ type, ticketId, payload: payload ?? null })
    .run();
  drainCommands(db);
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
});

test('start runs intake and waits for approval; approve advances; revise re-runs with feedback', async () => {
  const seen: { step: string; revision: unknown }[] = [];
  const executor: StepExecutor = ({ step, revision }) => {
    seen.push({ step, revision });
    return Promise.resolve({ kind: 'ok', output: `out-${step}-${seen.length}`, sessionId: 's1' });
  };
  const scheduler = new Scheduler(db, executor, 2);

  command('start');
  scheduler.tick();
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'awaiting_approval', step: 'intake' });
  expect(getTicket(db, ticketId).sessionId).toBe('s1');

  command('revise', { feedback: 'shorter' });
  scheduler.tick();
  await scheduler.idle();
  expect(seen[1]).toEqual({
    step: 'intake',
    revision: { previous: 'out-intake-1', feedback: 'shorter' },
  });
  expect(latestOutput(db, ticketId, 'intake')?.version).toBe(2);

  command('approve');
  scheduler.tick();
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'awaiting_approval', step: 'summary' });
});

test('executor failure moves the ticket to failed; retry runs the same step again', async () => {
  let calls = 0;
  const executor: StepExecutor = () => {
    calls += 1;
    return Promise.resolve(
      calls === 1 ? { kind: 'error', error: 'boom' } : { kind: 'ok', output: 'fine' },
    );
  };
  const scheduler = new Scheduler(db, executor, 1);
  command('start');
  scheduler.tick();
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase).toMatchObject({ kind: 'failed', error: 'boom' });

  command('retry');
  scheduler.tick();
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'awaiting_approval', step: 'intake' });
});

test('a thrown executor error is recorded, not propagated', async () => {
  const scheduler = new Scheduler(db, () => Promise.reject(new Error('crash')), 1);
  command('start');
  scheduler.tick();
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase).toMatchObject({ kind: 'failed', error: 'crash' });
});

test('rate limited tickets resume after retryAt', async () => {
  let calls = 0;
  const executor: StepExecutor = () => {
    calls += 1;
    return Promise.resolve(
      calls === 1 ? { kind: 'rate_limited', retryAt: 1000 } : { kind: 'ok', output: 'ok' },
    );
  };
  const scheduler = new Scheduler(db, executor, 1);
  command('start');
  scheduler.tick(0);
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase.kind).toBe('rate_limited');
  scheduler.tick(500);
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase.kind).toBe('rate_limited');
  scheduler.tick(1000);
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase.kind).toBe('awaiting_approval');
});

test('maxConcurrent caps parallel runs', async () => {
  const second = createTicket(db, { projectId: 1, title: 'second' }).id;
  let running = 0;
  let peak = 0;
  const executor: StepExecutor = async () => {
    running += 1;
    peak = Math.max(peak, running);
    await Bun.sleep(20);
    running -= 1;
    return { kind: 'ok', output: 'x' };
  };
  const scheduler = new Scheduler(db, executor, 1);
  command('start');
  db.insert(schema.commands).values({ type: 'start', ticketId: second }).run();
  drainCommands(db);
  scheduler.tick();
  await scheduler.idle();
  scheduler.tick();
  await scheduler.idle();
  expect(peak).toBe(1);
  expect(getTicket(db, second).phase.kind).toBe('awaiting_approval');
});

test('failing commands are marked handled with an error and an event', () => {
  db.insert(schema.commands).values({ type: 'approve', ticketId }).run();
  drainCommands(db);
  const [row] = db.select().from(schema.commands).all();
  expect(row?.handledAt).not.toBeNull();
  expect(row?.error).toContain('not awaiting approval');
  expect(
    db
      .select()
      .from(schema.events)
      .all()
      .map((e) => e.type),
  ).toContain('command_failed');
});

const echoStep: StepExecutor = ({ step }) => Promise.resolve({ kind: 'ok', output: `out-${step}` });

test('a chained run is accepted automatically and the next step sees it as approved', async () => {
  const scheduler = new Scheduler(db, echoStep, 1);
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement', thenRun: 'final_review' } })
    .run();
  scheduler.tick();
  await scheduler.idle();
  expect(latestOutput(db, ticketId, 'implement')).toMatchObject({ validation: 'approved' });
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'running', step: 'final_review' });
  scheduler.tick();
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase).toEqual({
    kind: 'awaiting_approval',
    step: 'final_review',
  });
  expect(latestOutput(db, ticketId, 'final_review')).toMatchObject({ validation: 'pending' });
});

test('a refused commit pauses the run; the decision resumes it, or the agent is sent back', async () => {
  const seen: { resume: unknown; revision: unknown }[] = [];
  const results: StepResult[] = [
    { kind: 'commit_refused', output: 'report, paused', sessionId: 's1' },
    { kind: 'ok', output: 'report, committed', sessionId: 's1' },
  ];
  const executor: StepExecutor = ({ resume, revision }) => {
    seen.push({ resume, revision });
    return Promise.resolve(results[seen.length - 1] ?? { kind: 'error', error: 'no more' });
  };
  const scheduler = new Scheduler(db, executor, 1);
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement', thenRun: 'final_review' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  scheduler.tick();
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase).toEqual({
    kind: 'commit_refused',
    step: 'implement',
    thenRun: 'final_review',
  });
  expect(latestOutput(db, ticketId, 'implement')).toMatchObject({
    content: 'report, paused',
    validation: 'pending',
  });
  expect(db.select().from(schema.runs).all().at(-1)).toMatchObject({
    status: 'succeeded',
    sessionId: 's1',
  });

  db.insert(schema.refusedCommits)
    .values({
      ticketId,
      step: 'implement',
      files: ['a.ts'],
      hookOutput: 'lint',
      diff: 'd',
      diffHash: 'h',
      message: 'proposed',
      report: 'report',
      resumeState: {},
    })
    .run();
  command('commit_anyway', { message: 'chosen message' });
  expect(latestRefusal(db, ticketId)).toMatchObject({
    resolution: 'commit',
    message: 'chosen message',
  });
  scheduler.tick();
  await scheduler.idle();
  expect(seen[1]).toEqual({ resume: 'commit', revision: null });
  // The chain goes on: the final review runs next.
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'running', step: 'final_review' });
});

test('sending the paused implementer back closes the refusal and resumes its session', () => {
  db.update(schema.tickets)
    .set({ phase: { kind: 'commit_refused', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  saveOutput(db, ticketId, 'implement', 'report, paused');
  db.insert(schema.refusedCommits)
    .values({
      ticketId,
      step: 'implement',
      files: ['a.ts'],
      hookOutput: 'lint',
      diff: 'd',
      diffHash: 'h',
      message: 'proposed',
      report: 'report',
      resumeState: {},
    })
    .run();
  command('revise', { feedback: 'fix the warnings in that page' });
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'running', step: 'implement' });
  expect(latestRefusal(db, ticketId)?.resolution).toBe('revise');
  expect(latestOutput(db, ticketId, 'implement')?.feedback).toBe('fix the warnings in that page');

  command('drop_leftovers');
  expect(db.select().from(schema.commands).all().at(-1)?.error).toContain('Invalid transition');
});

test('runs a stopped worker left running are failed and their containers stopped first', async () => {
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' }, containerName: 'union-t9' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  db.insert(schema.runs)
    .values({ ticketId, step: 'implement', model: 'opus', status: 'running' })
    .run();
  const stopped: string[] = [];
  const scheduler = new Scheduler(db, echoStep, 1);
  await scheduler.recover((name) => {
    stopped.push(name);
    return Promise.resolve();
  });
  expect(stopped).toEqual(['union-t9']);
  const [orphan] = db.select().from(schema.runs).all();
  expect(orphan).toMatchObject({ status: 'failed' });
  expect(orphan?.error).toContain('Interrupted');

  // The step runs again, once.
  scheduler.tick();
  await scheduler.idle();
  const statuses = db
    .select()
    .from(schema.runs)
    .all()
    .map((run) => run.status);
  expect(statuses).toEqual(['failed', 'succeeded']);
});
