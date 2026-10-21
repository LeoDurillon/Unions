import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  emitEvent,
  initStartTicks,
  migrateDb,
  readUnionUpdate,
  recordUpdateCheck,
  schema,
  setUpdateStatus,
  type Db,
  type UpdateCheck,
} from '@union/core';

import { NO_HOOKS } from './command-hooks';
import { drainCommands } from './commands';
import { startRefusal, UnionUpdater } from './union-update';

let db: Db;

const BEHIND: UpdateCheck = {
  localSha: 'a',
  remoteSha: 'b',
  ahead: 0,
  behind: 1,
  subjects: ['New'],
  refusal: null,
  error: null,
};

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
});

function startRun(): void {
  const project = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get();
  const ticket = createTicket(db, { projectId: project.id, title: 'T' });
  db.insert(schema.runs)
    .values({ ticketId: ticket.id, step: 'implement', model: 'opus', status: 'running' })
    .run();
}

test('an update needs a check, something to pull and no refusal', () => {
  expect(startRefusal(db, null, false)).toContain('not been checked');
  recordUpdateCheck(db, { ...BEHIND, behind: 0 });
  expect(startRefusal(db, readUnionUpdate(db), false)).toBe('Already up to date');
  recordUpdateCheck(db, { ...BEHIND, refusal: 'On branch x; only main updates' });
  expect(startRefusal(db, readUnionUpdate(db), false)).toBe('On branch x; only main updates');
  recordUpdateCheck(db, BEHIND);
  expect(startRefusal(db, readUnionUpdate(db), false)).toBeNull();
});

test('work in progress refuses, unless forced', () => {
  recordUpdateCheck(db, BEHIND);
  startRun();
  expect(startRefusal(db, readUnionUpdate(db), false)).toContain('ticket step: 1');
  expect(startRefusal(db, readUnionUpdate(db), true)).toBeNull();
});

test('an update already running refuses another', () => {
  recordUpdateCheck(db, BEHIND);
  setUpdateStatus(db, 'updating');
  expect(startRefusal(db, readUnionUpdate(db), true)).toContain('already running');
});

test('the commands reach the updater, with force only when it is true', () => {
  const calls: string[] = [];
  db.insert(schema.commands)
    .values([
      { type: 'union_update_check' },
      { type: 'union_update', payload: { force: true } },
      { type: 'union_update', payload: { force: 'yes' } },
    ])
    .run();
  drainCommands(db, {
    ...NO_HOOKS,
    checkUnionUpdate: () => {
      calls.push('check');
    },
    updateUnion: (force) => {
      calls.push(`update ${force}`);
    },
  });
  expect(calls).toEqual(['check', 'update true', 'update false']);
});

test('a reload of the worker keeps waiting for the restart; a new container ends it', async () => {
  recordUpdateCheck(db, BEHIND);
  setUpdateStatus(db, 'restarting');
  const init = await initStartTicks();
  emitEvent(db, { type: 'union_restart', payload: { from: 'a', to: 'b', init } });
  const updater = new UnionUpdater(db, true);
  await updater.recover();
  expect(readUnionUpdate(db)?.status).toBe(init === null ? 'idle' : 'restarting');
  expect(updater.paused()).toBe(init !== null);
  emitEvent(db, { type: 'union_restart', payload: { from: 'a', to: 'b', init: 'another' } });
  await updater.recover();
  expect(readUnionUpdate(db)?.status).toBe('idle');
  expect(updater.paused()).toBe(false);
});
