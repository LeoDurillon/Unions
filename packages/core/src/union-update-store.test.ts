import { beforeEach, expect, test } from 'bun:test';

import { activeWork } from './active-work';
import { createDb, migrateDb, type Db } from './db';
import * as schema from './tables';
import { createTicket } from './tickets';
import {
  readUnionUpdate,
  recordUpdateCheck,
  setUpdateStatus,
  updateInProgress,
  type UpdateCheck,
} from './union-update-store';

let db: Db;

const CHECK: UpdateCheck = {
  localSha: 'a',
  remoteSha: 'b',
  ahead: 0,
  behind: 2,
  subjects: ['Two', 'One'],
  migrations: 0,
  refusal: null,
  error: null,
};

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

test('a check creates the row, then overwrites it and keeps the status', () => {
  expect(readUnionUpdate(db)).toBeNull();
  recordUpdateCheck(db, CHECK);
  setUpdateStatus(db, 'updating');
  recordUpdateCheck(db, { ...CHECK, behind: 3 });
  const row = readUnionUpdate(db);
  expect(row?.behind).toBe(3);
  expect(row?.status).toBe('updating');
  expect(updateInProgress(row)).toBe(true);
});

test('a status change clears the error unless given one', () => {
  recordUpdateCheck(db, CHECK);
  setUpdateStatus(db, 'failed', 'boom');
  expect(readUnionUpdate(db)?.error).toBe('boom');
  setUpdateStatus(db, 'idle');
  expect(readUnionUpdate(db)?.error).toBeNull();
  expect(updateInProgress(readUnionUpdate(db))).toBe(false);
});

test('active work lists only the kinds with rows in progress', () => {
  expect(activeWork(db)).toEqual([]);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const ticket = createTicket(db, { projectId: project.id, title: 'T' });
  db.insert(schema.runs)
    .values({ ticketId: ticket.id, step: 'implement', model: 'opus', status: 'running' })
    .run();
  expect(activeWork(db)).toEqual([{ label: 'ticket step', count: 1, onRestart: 'restarts' }]);
});
