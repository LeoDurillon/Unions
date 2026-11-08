// Tests of the review side-run engine: a run cancelled before its work, a target always closed, and what recovery removes.

import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  migrateDb,
  schema,
  type ContainerRuntime,
  type Db,
} from '@union/core';

import type { ProvisionConfig } from '../provision';
import { RunSlots } from '../slots';
import type { AgentReviewDeps } from './agent-review';
import type { ReviewRun } from './agent-review-target';
import { SideReviewRunner, type SideReviewKind } from './engine';

type Row = ReviewRun & { status: string };
type Outcome = { status: string; error?: string };

let db: Db;
let removed: string[];
let closed: string[];
let finished: Map<number, Outcome>;
let ticketId: number;

function deps(): AgentReviewDeps {
  const runtime = {
    remove: (name: string) => {
      removed.push(name);
      return Promise.resolve();
    },
  } as unknown as ContainerRuntime;
  return { db, runtime, config: {} as ProvisionConfig, slots: new RunSlots(2) };
}

function kind(
  rows: Row[],
  work: SideReviewKind<Row, Outcome, { container: string; close: () => Promise<void> }>['work'],
  interrupted: Row[] = [],
): SideReviewKind<Row, Outcome, { container: string; close: () => Promise<void> }> {
  const queue = [...rows];
  return {
    kind: 'grouping',
    letter: 'g',
    claim: () => queue.shift() ?? null,
    finish: (_deps, row, outcome) => {
      finished.set(row.id, outcome);
    },
    failInterrupted: () => interrupted,
    open: (_deps, _row, names) =>
      Promise.resolve({
        container: names.name,
        close: () => {
          closed.push(names.name);
          return Promise.resolve();
        },
      }),
    hunkIndex: false,
    cancelled: { status: 'cancelled' },
    failed: (error) => ({ status: 'failed', error }),
    work,
  };
}

const onPullRequest: Row = { id: 4, ticketId: null, reviewId: 9, status: 'running' };
const onTicket: Row = { id: 5, ticketId: 2, reviewId: null, status: 'running' };

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  removed = [];
  closed = [];
  finished = new Map();
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'T' }).id;
});

/** A grouping row of the ticket, so the engine finds it and finishes it. */
function stored(): Row {
  const row = db
    .insert(schema.reviewGroupings)
    .values({ ticketId, sourceKind: 'ticket', sourceLabel: 'T', spec: 's', status: 'running' })
    .returning()
    .get();
  return { id: row.id, ticketId: row.ticketId, reviewId: row.reviewId, status: row.status };
}

test('a run whose work throws fails, and its checkout is closed', async () => {
  const row = stored();
  const runner = new SideReviewRunner(
    deps(),
    kind([row], () => Promise.reject(new Error('boom'))),
  );
  runner.tick();
  await runner.idle();
  expect(finished.get(row.id)).toEqual({ status: 'failed', error: 'boom' });
  expect(closed).toEqual([`union-g${row.id}`]);
});

test('a run cancelled while its checkout opens never starts its work', async () => {
  const row = stored();
  let worked = false;
  const { promise: opening, resolve: opened } = Promise.withResolvers<null>();
  const base = kind([row], () => {
    worked = true;
    return Promise.resolve({ status: 'succeeded' });
  });
  const runner = new SideReviewRunner(deps(), {
    ...base,
    open: async (d, r, names) => {
      await opening;
      return base.open(d, r, names);
    },
  });
  runner.tick();
  runner.cancel(row.id);
  opened(null);
  await runner.idle();
  expect(worked).toBe(false);
  expect(finished.get(row.id)).toEqual({ status: 'cancelled' });
  expect(closed).toEqual([`union-g${row.id}`]);
});

test('recovery removes the throwaway containers of runs on a pull request only, or of all', async () => {
  await new SideReviewRunner(
    deps(),
    kind([], () => Promise.resolve({ status: 'x' }), [onPullRequest, onTicket]),
  ).recover();
  expect(removed).toEqual(['union-g4']);
  removed = [];
  await new SideReviewRunner(deps(), {
    ...kind([], () => Promise.resolve({ status: 'x' }), [onPullRequest, onTicket]),
    throwaway: 'all',
  }).recover();
  expect(removed).toEqual(['union-g4', 'union-g5']);
});
