// Tests for a split ticket's CI: each open slice's counts, and one slice's checks picked with `?pr=`.
import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { PullRequestCheck, StackChecksView } from './ci-api-types';
import type { CiGitHub } from './github-checks';

function check(id: string, state: PullRequestCheck['state']): PullRequestCheck {
  return {
    id,
    name: id,
    state,
    conclusion: null,
    summary: null,
    url: null,
    workflowRunId: null,
    durationMs: null,
  };
}

const CHECKS: Record<number, PullRequestCheck[]> = {
  5: [check('a', 'passed'), check('b', 'skipped')],
  7: [check('a', 'failed'), check('b', 'passed'), check('c', 'pending')],
};

let listed: number[] = [];

const ci: CiGitHub = {
  listChecks: (_auth, _repo, number) => {
    listed.push(number);
    const checks = CHECKS[number];
    return Promise.resolve(checks ? { headSha: 'abc', checks, botComments: [] } : null);
  },
  readCheckRun: () => Promise.resolve(null),
  readJobLog: () => Promise.resolve(null),
  readComment: () => Promise.resolve(null),
};

let db: Db;
let app: Hono;
let ticketId: number;

function slice(position: number, prNumber: number | null, prState: 'open' | 'merged'): void {
  db.insert(schema.ticketSlices)
    .values({
      ticketId,
      position,
      title: `s${position}`,
      spec: 's',
      tipSha: 'a',
      branch: `b${position}`,
      prNumber,
      prState,
    })
    .run();
}

beforeEach(() => {
  listed = [];
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, undefined, undefined, ci);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'tok', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'T' }).id;
  db.update(schema.tickets).set({ prNumber: 7 }).where(eq(schema.tickets.id, ticketId)).run();
});

test("each open slice's checks are counted by state; merged ones are not read", async () => {
  slice(1, 4, 'merged');
  slice(2, 5, 'open');
  slice(3, 6, 'open');
  slice(4, 7, 'open');
  const res = await app.request(`/api/tickets/${ticketId}/pr-checks/stack`);
  expect(res.status).toBe(200);
  const view = (await res.json()) as StackChecksView;
  expect(listed.toSorted((a, b) => a - b)).toEqual([5, 6, 7]);
  expect(view.slices).toEqual([
    { position: 2, prNumber: 5, counts: { pending: 0, passed: 1, failed: 0, skipped: 1 } },
    { position: 3, prNumber: 6, counts: null },
    { position: 4, prNumber: 7, counts: { pending: 1, passed: 1, failed: 1, skipped: 0 } },
  ]);
});

test('a ticket that is not split has no slices to read', async () => {
  const view = (await (
    await app.request(`/api/tickets/${ticketId}/pr-checks/stack`)
  ).json()) as StackChecksView;
  expect(view.slices).toEqual([]);
  expect(listed).toEqual([]);
});

test("a slice's pull request is read with ?pr=; one outside the stack is refused", async () => {
  slice(1, 5, 'open');
  slice(2, 7, 'open');
  const picked = await app.request(`/api/tickets/${ticketId}/pr-checks?pr=5`);
  expect(picked.status).toBe(200);
  expect(listed).toEqual([5]);
  const outside = await app.request(`/api/tickets/${ticketId}/pr-checks?pr=99`);
  expect(outside.status).toBe(404);
  expect(listed).toEqual([5]);
});
