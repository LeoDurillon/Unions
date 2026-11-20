// Tests of compacting a ticket's implementer session: when it is refused, the queue, the size it shows.

import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { createDb, migrateDb, type Db } from '../db';
import type { Phase } from '../phases';
import * as schema from '../tables';
import {
  cancelQueuedSessionCompaction,
  claimSessionCompaction,
  compactionRefusal,
  implementerSessionSize,
  latestSessionCompaction,
  queueSessionCompaction,
  recoverSessionCompactions,
} from './session-compactions';
import { createTicket } from './tickets';

let db: Db;
let ticketId: number;

const SESSION = 'session-a';

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Search', body: '' }).id;
});

function implemented(sessionId = SESSION): void {
  db.insert(schema.runs)
    .values({ ticketId, step: 'implement', model: 'opus', status: 'succeeded', sessionId })
    .run();
}

let line = 0;

/** A recorded call of the session: its peak, and where it ended (null: before that was kept). */
function call(peakContext: number, ended?: { peak: number | null; end: number | null }): void {
  line += 1;
  db.insert(schema.agentUsage)
    .values({
      resultLineId: line,
      ticketId,
      sessionId: SESSION,
      model: 'opus',
      main: true,
      input: 0,
      cacheRead: 0,
      cacheWrite: 0,
      output: 0,
      thinking: 0,
      webSearches: 0,
      peakContext: ended ? ended.peak : peakContext,
      endContext: ended?.end ?? null,
    })
    .run();
}

function setPhase(phase: Phase): void {
  db.update(schema.tickets).set({ phase }).where(eq(schema.tickets.id, ticketId)).run();
}

test('refused before the implementation has a session, and while a step runs', () => {
  expect(compactionRefusal(db, ticketId)).toContain('no session');
  expect(() => queueSessionCompaction(db, ticketId)).toThrow('no session');
  implemented();
  setPhase({ kind: 'running', step: 'final_review' });
  expect(compactionRefusal(db, ticketId)).toContain('current run');
  setPhase({ kind: 'awaiting_approval', step: 'final_review' });
  expect(compactionRefusal(db, ticketId)).toBeNull();
});

test('one at a time; it records the session and its size, and is claimed once', () => {
  implemented();
  call(400_000);
  const row = queueSessionCompaction(db, ticketId);
  expect(row).toMatchObject({ sessionId: SESSION, contextBefore: 400_000, status: 'queued' });
  expect(() => queueSessionCompaction(db, ticketId)).toThrow('already being compacted');
  expect(claimSessionCompaction(db)?.id).toBe(row.id);
  expect(claimSessionCompaction(db)).toBeNull();
});

test('the size is where the last call ended: a compaction’s summary, else the peak', () => {
  implemented();
  call(400_000);
  expect(implementerSessionSize(db, ticketId)?.context).toBe(400_000);
  call(0, { peak: null, end: 12_000 });
  expect(implementerSessionSize(db, ticketId)).toEqual({ sessionId: SESSION, context: 12_000 });
});

test('waits while the description is rewritten in the same session', () => {
  implemented();
  db.update(schema.tickets).set({ prNumber: 9 }).where(eq(schema.tickets.id, ticketId)).run();
  db.insert(schema.prDescriptions).values({ ticketId, prNumber: 9, status: 'running' }).run();
  expect(compactionRefusal(db, ticketId)).toContain('PR description');
});

test('a queued one is cancelled; a running one fails when the worker stops', () => {
  implemented();
  const queued = queueSessionCompaction(db, ticketId);
  expect(cancelQueuedSessionCompaction(db, queued.id)).toBe(true);
  expect(latestSessionCompaction(db, ticketId)?.status).toBe('cancelled');
  queueSessionCompaction(db, ticketId);
  const running = claimSessionCompaction(db);
  expect(running && cancelQueuedSessionCompaction(db, running.id)).toBe(false);
  recoverSessionCompactions(db);
  expect(latestSessionCompaction(db, ticketId)).toMatchObject({
    status: 'failed',
    error: 'The worker stopped during the compaction',
  });
});
