// Tests of a run stopped midway: Cancel aborts it and keeps nothing; the worker's stop leaves the step to run again.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  getTicket,
  latestOutput,
  migrateDb,
  schema,
  type Db,
} from '@union/core';
import { eq, sql } from 'drizzle-orm';

import { drainCommands } from './commands';
import { INTERRUPTED } from './run-end';
import { Scheduler, type StepContext, type StepResult } from './scheduler';

let db: Db;
let ticketId: number;

function command(type: string): void {
  db.insert(schema.commands).values({ type, ticketId, payload: null }).run();
  drainCommands(db);
}

function runs(): { status: string; error: string | null }[] {
  return db
    .select({ status: schema.runs.status, error: schema.runs.error })
    .from(schema.runs)
    .where(eq(schema.runs.ticketId, ticketId))
    .all();
}

function eventTypes(): string[] {
  return db
    .select({ type: schema.events.type })
    .from(schema.events)
    .all()
    .map((row) => row.type);
}

/** An executor that runs until its signal is aborted, then answers `onAbort`; `started` resolves once it runs. */
function abortable(onAbort: StepResult): {
  executor: (context: StepContext) => Promise<StepResult>;
  started: Promise<AbortSignal>;
} {
  const { promise: started, resolve } = Promise.withResolvers<AbortSignal>();
  return {
    started,
    executor: ({ signal }) => {
      resolve(signal);
      const { promise, resolve: done } = Promise.withResolvers<StepResult>();
      signal.addEventListener('abort', () => {
        done(onAbort);
      });
      return promise;
    },
  };
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 't' }).id;
});

test("Cancel during a run aborts that run's signal; the run ends Cancelled and nothing is dispatched", async () => {
  const { executor, started } = abortable({ kind: 'error', error: 'claude exited with 143' });
  const scheduler = new Scheduler(db, executor, 2);
  command('start');
  scheduler.tick();
  const signal = await started;
  command('cancel');
  scheduler.tick();
  expect(signal.aborted).toBe(true);
  expect(signal.reason).toBe('cancelled');
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase.kind).toBe('cancelled');
  expect(runs()).toEqual([{ status: 'failed', error: 'Cancelled' }]);
  expect(eventTypes()).not.toContain('worker_error');
});

test('a result arriving after Cancel is not kept', async () => {
  const { promise: release, resolve } = Promise.withResolvers<null>();
  const scheduler = new Scheduler(
    db,
    async () => {
      await release;
      return { kind: 'ok', output: 'late plan' };
    },
    2,
  );
  command('start');
  scheduler.tick();
  command('cancel');
  resolve(null);
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase.kind).toBe('cancelled');
  expect(latestOutput(db, ticketId, 'intake')).toBeUndefined();
  expect(runs()).toEqual([{ status: 'failed', error: 'Cancelled' }]);
});

test("the worker's stop leaves the ticket running with an interrupted run, for the next worker", async () => {
  const { executor, started } = abortable({ kind: 'error', error: 'claude exited with 143' });
  const scheduler = new Scheduler(db, executor, 2);
  command('start');
  scheduler.tick();
  const signal = await started;
  scheduler.stop();
  expect(signal.reason).toBe('shutdown');
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase).toMatchObject({ kind: 'running', step: 'intake' });
  expect(runs()).toEqual([{ status: 'failed', error: INTERRUPTED }]);
});

test('a run that finished as the worker stopped keeps its result', async () => {
  const { executor, started } = abortable({ kind: 'ok', output: 'the plan' });
  const scheduler = new Scheduler(db, executor, 2);
  command('start');
  scheduler.tick();
  await started;
  scheduler.stop();
  await scheduler.idle();
  expect(getTicket(db, ticketId).phase).toEqual({ kind: 'awaiting_approval', step: 'intake' });
});

test('a ticket removed during its run ends it quietly', async () => {
  const scheduler = new Scheduler(db, () => Promise.resolve({ kind: 'ok', output: 'x' }), 2);
  command('start');
  scheduler.tick();
  db.delete(schema.tickets).where(eq(schema.tickets.id, ticketId)).run();
  await scheduler.idle();
  expect(eventTypes()).not.toContain('worker_error');
});

test("a throw in a run's bookkeeping is recorded as worker_error, not left unhandled", async () => {
  const scheduler = new Scheduler(db, () => Promise.resolve({ kind: 'ok', output: 'x' }), 2);
  command('start');
  db.run(sql`DROP TABLE runs`);
  scheduler.tick();
  await scheduler.idle();
  expect(eventTypes()).toContain('worker_error');
});
