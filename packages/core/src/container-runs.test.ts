import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import {
  cancelQueuedContainerRun,
  claimContainerRun,
  ContainerRunError,
  finishContainerRun,
  getContainerRun,
  listContainerRuns,
  MAX_OUTPUT_CHARS,
  MAX_OUTPUT_LINES,
  outputTail,
  queueContainerRun,
  recoverContainerRuns,
} from './container-runs';
import { createDb, migrateDb, type Db } from './db';
import * as schema from './schema';
import { createTicket, type Ticket } from './tickets';

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
  const run = queueContainerRun(db, { ticketId, command: '  npm test  ' });
  expect(run).toMatchObject({ command: 'npm test', status: 'queued', timeoutSec: 600 });
  expect(() => queueContainerRun(db, { ticketId, command: 'ls' })).toThrow(ContainerRunError);
  finishContainerRun(db, run.id, { status: 'succeeded', exitCode: 0, error: null, output: '' });
  setPhase({ kind: 'running', step: 'implement' });
  expect(() => queueContainerRun(db, { ticketId, command: 'ls' })).toThrow('A step is running');
  setPhase({ kind: 'cancelled' });
  expect(() => queueContainerRun(db, { ticketId, command: 'ls' })).toThrow('cancelled');
});

test('empty commands and timeouts out of range are refused', () => {
  expect(() => queueContainerRun(db, { ticketId, command: '  ' })).toThrow(ContainerRunError);
  expect(() => queueContainerRun(db, { ticketId, command: 'ls', timeoutSec: 0 })).toThrow(
    'timeout',
  );
  expect(() => queueContainerRun(db, { ticketId, command: 'ls', timeoutSec: 1801 })).toThrow(
    'timeout',
  );
});

test('claimed oldest first; a queued run cancels here, a running one does not', () => {
  const run = queueContainerRun(db, { ticketId, command: 'ls' });
  expect(claimContainerRun(db)).toMatchObject({ id: run.id, status: 'running' });
  expect(claimContainerRun(db)).toBeNull();
  expect(cancelQueuedContainerRun(db, run.id)).toBe(false);
  recoverContainerRuns(db);
  expect(getContainerRun(db, run.id)).toMatchObject({ status: 'failed' });
  const next = queueContainerRun(db, { ticketId, command: 'pwd' });
  expect(cancelQueuedContainerRun(db, next.id)).toBe(true);
  expect(listContainerRuns(db, ticketId).map((row) => row.status)).toEqual(['cancelled', 'failed']);
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
