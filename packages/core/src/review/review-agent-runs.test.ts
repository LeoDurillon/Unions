import { beforeEach, expect, test } from 'bun:test';

import {
  claimCustomAgentPrompt,
  createCustomAgent,
  deleteCustomAgent,
  finishCustomAgentPrompt,
} from '../custom-agents/custom-agents';
import { createDb, migrateDb, type Db } from '../db';
import { isEvent } from '../event/event-catalog';
import * as tables from '../tables';
import { createTicket } from '../ticket/tickets';
import type { AgentReviewOwner } from './agent-reviews';
import {
  cancelQueuedReviewAgentRun,
  claimReviewAgentRun,
  failInterruptedReviewAgentRuns,
  finishReviewAgentRun,
  latestReviewAgentRuns,
  queueReviewAgentRun,
  ReviewAgentRunError,
} from './review-agent-runs';

let db: Db;
let ticket: AgentReviewOwner;
let review: AgentReviewOwner;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(tables.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticket = { kind: 'ticket', id: createTicket(db, { projectId, title: 'T' }).id };
  const reviewId = db
    .insert(tables.currentReviews)
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
  review = { kind: 'review', id: reviewId };
});

function agent(name: string, kind: 'step' | 'review' = 'review', written = true): number {
  const created = createCustomAgent(db, { name, role: 'Review it', kind });
  if (written) {
    claimCustomAgentPrompt(db);
    finishCustomAgentPrompt(db, created.id, { prompt: 'Review it.' });
  }
  return created.id;
}

test('only a live review agent with a prompt can run', () => {
  const step = agent('Plan check', 'step');
  const unwritten = agent('Unwritten', 'review', false);
  const gone = agent('Gone');
  deleteCustomAgent(db, gone);
  const queue = (id: number) => (): unknown => queueReviewAgentRun(db, ticket, id);
  for (const id of [step, unwritten, gone, 404]) {
    expect(queue(id)).toThrow(ReviewAgentRunError);
  }
});

test('one run at a time per change, any agent; another change is free', () => {
  const merge = agent('Merge');
  const security = agent('Security');
  queueReviewAgentRun(db, ticket, merge);
  expect(() => queueReviewAgentRun(db, ticket, security)).toThrow(
    'A review agent is already running on this change',
  );
  expect(queueReviewAgentRun(db, review, security).reviewId).toBe(review.id);
});

test('a run is claimed, finished with its markdown, and replaced by the next one of its agent', () => {
  const merge = agent('Merge');
  const security = agent('Security');
  const first = queueReviewAgentRun(db, ticket, merge);
  expect(claimReviewAgentRun(db)?.id).toBe(first.id);
  expect(claimReviewAgentRun(db)).toBeNull();
  finishReviewAgentRun(db, first.id, { status: 'succeeded', headSha: 'abc', output: '# Ok' });
  const other = queueReviewAgentRun(db, ticket, security);
  finishReviewAgentRun(db, other.id, { status: 'failed', error: 'Usage limit reached' });
  const again = queueReviewAgentRun(db, ticket, merge);
  const latest = latestReviewAgentRuns(db, ticket);
  expect(latest.map((run) => [run.agentId, run.id, run.status])).toEqual([
    [merge, again.id, 'queued'],
    [security, other.id, 'failed'],
  ]);
  expect(latest[1]?.error).toBe('Usage limit reached');
  expect(latestReviewAgentRuns(db, review)).toEqual([]);
});

test('a queued run can be cancelled, a running one is left to its runner', () => {
  const merge = agent('Merge');
  const queued = queueReviewAgentRun(db, ticket, merge);
  expect(cancelQueuedReviewAgentRun(db, queued.id)).toBe(true);
  const running = queueReviewAgentRun(db, ticket, merge);
  claimReviewAgentRun(db);
  expect(cancelQueuedReviewAgentRun(db, running.id)).toBe(false);
});

test("a stopped worker's running runs fail, and every change is logged", () => {
  const merge = agent('Merge');
  const run = queueReviewAgentRun(db, review, merge);
  claimReviewAgentRun(db);
  expect(failInterruptedReviewAgentRuns(db).map((left) => left.id)).toEqual([run.id]);
  expect(latestReviewAgentRuns(db, review)[0]?.error).toBe('The worker stopped during the run');
  const statuses = db
    .select()
    .from(tables.events)
    .all()
    .filter((event) => isEvent(event, 'review_agent_run_changed'))
    .map((event) => event.payload.status);
  expect(statuses).toEqual(['queued', 'running', 'failed']);
});
