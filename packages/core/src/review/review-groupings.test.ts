// Tests of groupings by spec through the shared review-run lifecycle: one at a time per change, claimed, cancelled, failed on restart.

import { beforeEach, expect, test } from 'bun:test';

import type { AgentReviewOwner } from '../agent-reviews';
import { createDb, migrateDb, type Db } from '../db';
import * as schema from '../tables';
import { createTicket } from '../tickets';
import {
  cancelQueuedGrouping,
  claimGrouping,
  failInterruptedGroupings,
  finishGrouping,
  GroupingBusyError,
  latestGrouping,
  queueGrouping,
  type GroupingSpec,
} from './review-groupings';

let db: Db;
let first: AgentReviewOwner;
let second: AgentReviewOwner;

const SPEC: GroupingSpec = { kind: 'ticket', label: 'Ticket', spec: 'Do it' };

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  first = { kind: 'ticket', id: createTicket(db, { projectId, title: 'A' }).id };
  second = { kind: 'ticket', id: createTicket(db, { projectId, title: 'B' }).id };
});

function changes(): string[] {
  return db
    .select({ type: schema.events.type, payload: schema.events.payload })
    .from(schema.events)
    .all()
    .filter((row) => row.type === 'review_grouping_changed')
    .map((row) => (row.payload as { status: string }).status);
}

test('one grouping at a time per change, claimed oldest first, each change an event', () => {
  const a = queueGrouping(db, first, SPEC);
  expect(() => queueGrouping(db, first, SPEC)).toThrow(GroupingBusyError);
  const b = queueGrouping(db, second, SPEC);
  expect(claimGrouping(db)?.id).toBe(a.id);
  expect(claimGrouping(db)?.id).toBe(b.id);
  expect(claimGrouping(db)).toBeNull();
  expect(changes()).toEqual(['queued', 'queued', 'running', 'running']);
});

test('a finished grouping is replaced by the next one of its change', () => {
  const a = queueGrouping(db, first, SPEC);
  claimGrouping(db);
  finishGrouping(db, a.id, { status: 'failed', error: 'boom' });
  const b = queueGrouping(db, first, SPEC);
  expect(latestGrouping(db, first)?.id).toBe(b.id);
  expect(db.select().from(schema.reviewGroupings).all()).toHaveLength(1);
});

test('only a queued grouping cancels here; a running one fails when the worker stopped', () => {
  const a = queueGrouping(db, first, SPEC);
  const b = queueGrouping(db, second, SPEC);
  claimGrouping(db);
  expect(cancelQueuedGrouping(db, a.id)).toBe(false);
  expect(cancelQueuedGrouping(db, b.id)).toBe(true);
  expect(latestGrouping(db, second)).toMatchObject({ status: 'cancelled' });
  expect(failInterruptedGroupings(db).map((row) => row.id)).toEqual([a.id]);
  expect(latestGrouping(db, first)).toMatchObject({
    status: 'failed',
    error: 'The worker stopped during the grouping',
  });
});
