// Tests what Union records of a ticket's branch on GitHub: its push, a move away from it, a resync.
import { beforeEach, expect, test } from 'bun:test';

import { eq } from 'drizzle-orm';

import { recordMove, recordPushed, recordResync, takeResyncedFrom } from './branch-moves';
import { createDb, migrateDb, type Db } from './db';
import * as schema from './tables';
import { createTicket, getTicket } from './tickets';

let db: Db;
let ticketId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Moved' }).id;
});

function events(type: string): unknown[] {
  return db
    .select()
    .from(schema.events)
    .where(eq(schema.events.type, type))
    .all()
    .map((row) => row.payload);
}

test('a move is recorded once, and a push clears it', () => {
  recordPushed(db, ticketId, 'aaa');
  const move = { from: 'aaa', to: 'bbb', kind: 'diverged' } as const;
  recordMove(db, ticketId, move);
  recordMove(db, ticketId, move);
  expect(getTicket(db, ticketId).remoteMoved).toEqual(move);
  expect(events('branch_moved')).toEqual([move]);
  recordPushed(db, ticketId, 'ccc');
  expect(getTicket(db, ticketId)).toMatchObject({ pushedSha: 'ccc', remoteMoved: null });
});

test('a resync takes the new head and leaves a marker the next run reads once', () => {
  recordMove(db, ticketId, { from: 'aaa', to: 'bbb', kind: 'ahead' });
  recordResync(db, ticketId, { from: 'aaa', to: 'bbb' });
  expect(getTicket(db, ticketId)).toMatchObject({ pushedSha: 'bbb', remoteMoved: null });
  expect(events('branch_resynced')).toEqual([{ from: 'aaa', to: 'bbb' }]);
  expect(takeResyncedFrom(db, ticketId)).toBe('aaa');
  expect(takeResyncedFrom(db, ticketId)).toBeNull();
});
