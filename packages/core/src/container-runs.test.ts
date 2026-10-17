import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import {
  cancelQueuedContainerRun,
  claimContainerRun,
  ContainerRunError,
  finishContainerRun,
  getContainerRun,
  keepForAgent,
  listContainerRuns,
  markSentToAgent,
  MAX_OUTPUT_CHARS,
  MAX_OUTPUT_LINES,
  outputTail,
  pendingForAgent,
  queueContainerRun,
  recoverContainerRuns,
  revisesImplementer,
  sendToAgent,
} from './container-runs';
import { createDb, migrateDb, type Db } from './db';
import * as schema from './tables';
import { createTicket, getTicket, type Ticket } from './tickets';

let db: Db;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'T' }).id;
});

function setPhase(phase: Ticket['phase']): void {
  db.update(schema.tickets).set({ phase }).where(eq(schema.tickets.id, ticketId)).run();
}

test('one command at a time per workspace, never during a step', () => {
  const run = queueContainerRun(db, { owner: { ticketId }, command: '  npm test  ' });
  expect(run).toMatchObject({ command: 'npm test', status: 'queued', timeoutSec: 600 });
  expect(() => queueContainerRun(db, { owner: { ticketId }, command: 'ls' })).toThrow(
    ContainerRunError,
  );
  finishContainerRun(db, run.id, { status: 'succeeded', exitCode: 0, error: null, output: '' });
  setPhase({ kind: 'running', step: 'implement' });
  expect(() => queueContainerRun(db, { owner: { ticketId }, command: 'ls' })).toThrow(
    'A step is running',
  );
  setPhase({ kind: 'cancelled' });
  expect(() => queueContainerRun(db, { owner: { ticketId }, command: 'ls' })).toThrow('cancelled');
});

test('empty commands and timeouts out of range are refused', () => {
  expect(() => queueContainerRun(db, { owner: { ticketId }, command: '  ' })).toThrow(
    ContainerRunError,
  );
  expect(() =>
    queueContainerRun(db, { owner: { ticketId }, command: 'ls', timeoutSec: 0 }),
  ).toThrow('timeout');
  expect(() =>
    queueContainerRun(db, { owner: { ticketId }, command: 'ls', timeoutSec: 1801 }),
  ).toThrow('timeout');
});

test('claimed oldest first; a queued run cancels here, a running one does not', () => {
  const run = queueContainerRun(db, { owner: { ticketId }, command: 'ls' });
  expect(claimContainerRun(db)).toMatchObject({ id: run.id, status: 'running' });
  expect(claimContainerRun(db)).toBeNull();
  expect(cancelQueuedContainerRun(db, run.id)).toBe(false);
  recoverContainerRuns(db);
  expect(getContainerRun(db, run.id)).toMatchObject({ status: 'failed' });
  const next = queueContainerRun(db, { owner: { ticketId }, command: 'pwd' });
  expect(cancelQueuedContainerRun(db, next.id)).toBe(true);
  expect(listContainerRuns(db, { ticketId }).map((row) => row.status)).toEqual([
    'cancelled',
    'failed',
  ]);
});

test('the output keeps its last lines, colours stripped, within the size limit', () => {
  const lines = Array.from(
    { length: MAX_OUTPUT_LINES + 10 },
    (_, i) => `\u001B[31mline ${i}\u001B[0m`,
  );
  const tail = outputTail(lines);
  expect(tail.split('\n')).toHaveLength(MAX_OUTPUT_LINES);
  expect(tail.startsWith('line 10\n')).toBe(true);
  expect(outputTail(['x'.repeat(MAX_OUTPUT_CHARS + 5)])).toHaveLength(MAX_OUTPUT_CHARS);
});

function finished(command = 'npm test'): number {
  const run = queueContainerRun(db, { owner: { ticketId }, command });
  finishContainerRun(db, run.id, { status: 'failed', exitCode: 1, error: null, output: 'FAIL' });
  return run.id;
}

test('a finished output is kept for the next run, taken back, and stays read once read', () => {
  const running = queueContainerRun(db, { owner: { ticketId }, command: 'ls' });
  expect(() => keepForAgent(db, running.id, true)).toThrow('not finished');
  finishContainerRun(db, running.id, { status: 'succeeded', exitCode: 0, error: null, output: '' });
  const id = finished();
  keepForAgent(db, running.id, true);
  keepForAgent(db, id, true);
  expect(pendingForAgent(db, ticketId).map((run) => run.id)).toEqual([running.id, id]);
  keepForAgent(db, running.id, false);
  markSentToAgent(db, [id]);
  expect(pendingForAgent(db, ticketId)).toEqual([]);
  expect(() => keepForAgent(db, id, false)).toThrow('already read');
});

test('sending now queues a revision, only when it goes back to the implementer', () => {
  const id = finished();
  setPhase({ kind: 'awaiting_approval', step: 'technical' });
  expect(revisesImplementer(getTicket(db, ticketId).phase)).toBe(false);
  expect(() => sendToAgent(db, id, 'fix it')).toThrow('cannot go back');
  setPhase({ kind: 'awaiting_approval', step: 'final_review' });
  expect(sendToAgent(db, id, 'fix it').forAgent).toBe('next_run');
  expect(db.select().from(schema.commands).all()).toMatchObject([
    { type: 'revise', ticketId, payload: { feedback: 'fix it' } },
  ]);
  setPhase({ kind: 'done' });
  expect(revisesImplementer(getTicket(db, ticketId).phase)).toBe(true);
});

test("a pull request's commands queue on their own, one at a time, and never reach an agent", () => {
  const { projectId } = getTicket(db, ticketId);
  const reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'PR',
      url: 'u',
      author: 'alice',
      headBranch: 'b',
      baseBranch: 'main',
    })
    .returning()
    .get().id;
  setPhase({ kind: 'running', step: 'implement' });
  const run = queueContainerRun(db, { owner: { reviewId }, command: 'ls' });
  expect(run).toMatchObject({ ticketId: null, reviewId });
  expect(() => queueContainerRun(db, { owner: { reviewId }, command: 'pwd' })).toThrow(
    'already running',
  );
  expect(listContainerRuns(db, { reviewId }).map((row) => row.id)).toEqual([run.id]);
  expect(listContainerRuns(db, { ticketId })).toEqual([]);
  finishContainerRun(db, run.id, { status: 'succeeded', exitCode: 0, error: null, output: '' });
  expect(() => keepForAgent(db, run.id, true)).toThrow('no agent');
  expect(() => sendToAgent(db, run.id, 'look')).toThrow('no agent');
  // Exactly one owner.
  const insert = (values: { ticketId?: number; reviewId?: number }): void => {
    db.insert(schema.containerRuns)
      .values({ ...values, command: 'ls', timeoutSec: 1 })
      .run();
  };
  expect(() => {
    insert({ ticketId, reviewId });
  }).toThrow();
  expect(() => {
    insert({});
  }).toThrow();
});
