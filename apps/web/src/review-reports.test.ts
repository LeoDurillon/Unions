import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  finishReport,
  latestReport,
  migrateDb,
  schema,
  type Db,
  type NotionApi,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';
import type { ReviewSpecView } from './review-spec-types';
import type { ReportView } from './routes/review-reports';

const github = {
  getDiscussion: () =>
    Promise.resolve({ description: 'Unpublish the other scenarios.', threads: [], notes: [] }),
} as unknown as OnboardingGitHub;

let db: Db;
let app: Hono;
let projectId: number;
let ticketId: number;

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}

function setPhase(phase: typeof schema.tickets.$inferInsert.phase): void {
  db.update(schema.tickets).set({ phase }).where(eq(schema.tickets.id, ticketId)).run();
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github, {} as NotionApi);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'ghp_x', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Campaign', body: 'Ticket text' }).id;
  db.update(schema.tickets)
    .set({ branch: 'feature', prNumber: 7 })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  db.insert(schema.diffSnapshots).values({ ticketId, baseBranch: 'main', headSha: 'h1' }).run();
});

test("a report reads the review's specs, numbered; one at a time; outdated once the change moves", async () => {
  const base = `/api/tickets/${ticketId}/reports`;
  expect(await json<unknown>(call('GET', base))).toBeNull();
  const [ticket] = await json<ReviewSpecView[]>(call('GET', `/api/tickets/${ticketId}/specs`));
  await call('PUT', `/api/tickets/${ticketId}/specs`, {
    specs: [
      { ...ticket, text: 'Only the threshold.' },
      { kind: 'pr', ref: null, label: 'PR #7 description', url: null, text: null, removed: false },
      { kind: 'issue', ref: '12', label: 'Issue #12', url: null, text: 'No.', removed: true },
      {
        kind: 'issue',
        ref: '13',
        label: 'Issue #13',
        url: null,
        text: 'Only the threshold.',
        removed: false,
      },
    ],
  });
  const started = await call('POST', base);
  expect(started.status).toBe(202);
  expect(await json<ReportView>(started)).toMatchObject({
    status: 'queued',
    specs: [
      { id: 1, kind: 'ticket', label: 'Ticket description' },
      { id: 2, kind: 'pr', label: 'PR #7 description' },
      { id: 3, kind: 'issue', label: 'Issue #13', sameAs: 1 },
    ],
  });
  const queued = latestReport(db, { kind: 'ticket', id: ticketId });
  // The issue holds the same text as the ticket: it is not sent again.
  expect(queued?.specs.map((spec) => spec.text)).toEqual([
    'Only the threshold.',
    'Unpublish the other scenarios.',
    '',
  ]);
  expect((await call('POST', base)).status).toBe(409);

  finishReport(db, queued?.id ?? 0, {
    status: 'succeeded',
    headSha: 'h1',
    result: {
      verdict: 'matches',
      summary: 'Done.',
      attention: [],
      importantFiles: [],
      skim: [],
      unreviewed: [],
      requirements: [],
      outOfScope: [],
      risks: [],
      questions: [],
      docs: [],
      dropped: 0,
    },
  });
  expect(await json<unknown>(call('GET', base))).toMatchObject({
    status: 'succeeded',
    outdated: false,
  });
  db.insert(schema.diffSnapshots).values({ ticketId, baseBranch: 'main', headSha: 'h2' }).run();
  expect(await json<unknown>(call('GET', base))).toMatchObject({ outdated: true });
});

test('no report while a run uses the workspace, nor without a readable spec', async () => {
  const base = `/api/tickets/${ticketId}/reports`;
  setPhase({ kind: 'running', step: 'implement' });
  const busy = await call('POST', base);
  expect(busy.status).toBe(409);
  expect(await busy.text()).toContain('Wait for the current run to finish');
  setPhase({ kind: 'done' });
  const [ticket] = await json<ReviewSpecView[]>(call('GET', `/api/tickets/${ticketId}/specs`));
  await call('PUT', `/api/tickets/${ticketId}/specs`, { specs: [{ ...ticket, removed: true }] });
  const none = await call('POST', base);
  expect(none.status).toBe(409);
  expect(await none.text()).toContain('No spec can be read');
  // An edit that long is refused when saved; a source can be that long.
  await call('PUT', `/api/tickets/${ticketId}/specs`, { specs: [{ ...ticket, removed: false }] });
  db.update(schema.tickets)
    .set({ body: 'x'.repeat(50_001) })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect(await (await call('POST', base)).text()).toContain('longer than 50000 characters');
  expect(latestReport(db, { kind: 'ticket', id: ticketId })).toBeNull();
});

test('cancelling a report is a command for the worker; nothing to cancel is refused', async () => {
  const base = `/api/tickets/${ticketId}/reports`;
  expect((await call('POST', `${base}/cancel`)).status).toBe(409);
  await call('POST', base);
  expect((await call('POST', `${base}/cancel`)).status).toBe(202);
  const command = db.select().from(schema.commands).get();
  expect(command).toMatchObject({
    type: 'cancel_review_report',
    payload: { reportId: latestReport(db, { kind: 'ticket', id: ticketId })?.id },
  });
});

test("a pull request's report reads its description, once its files are read", async () => {
  db.insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 9,
      title: 'PR 9',
      url: 'u',
      author: 'alice',
      headBranch: 'b',
      baseBranch: 'main',
    })
    .run();
  const base = `/api/projects/${projectId}/pull-requests/reviews/9/reports`;
  expect(await (await call('POST', base)).text()).toContain('Open the diff first');
  db.update(schema.currentReviews).set({ files: [], headSha: 'p1' }).run();
  expect(await json<ReportView>(call('POST', base))).toMatchObject({
    status: 'queued',
    specs: [{ id: 1, kind: 'pr', label: 'PR #9 description' }],
  });
  const reviewId = db.select().from(schema.currentReviews).get()?.id ?? 0;
  expect(latestReport(db, { kind: 'review', id: reviewId })?.specs[0]?.text).toBe(
    'Unpublish the other scenarios.',
  );
});

test("the report's gaps become one draft on the whole change, while the report is current", async () => {
  const base = `/api/tickets/${ticketId}/reports`;
  expect((await call('POST', `${base}/gaps`)).status).toBe(409);
  await call('POST', base);
  const queued = latestReport(db, { kind: 'ticket', id: ticketId });
  const requirement = {
    key: 'tooltip',
    title: 'Tooltip',
    spec: null,
    specId: null,
    evidence: [],
    tests: [],
    note: 'Not found.',
  };
  const result = {
    verdict: 'partial' as const,
    summary: '',
    attention: [],
    importantFiles: [],
    skim: [],
    unreviewed: [],
    requirements: [{ ...requirement, status: 'done' as const }],
    outOfScope: [],
    risks: [],
    questions: [],
    docs: [],
    dropped: 0,
  };
  finishReport(db, queued?.id ?? 0, { status: 'succeeded', headSha: 'h1', result });
  const none = await call('POST', `${base}/gaps`);
  expect(await none.text()).toContain('every requirement met');

  db.update(schema.reviewReports)
    .set({ result: { ...result, requirements: [{ ...requirement, status: 'missing' }] } })
    .run();
  const added = await call('POST', `${base}/gaps`);
  expect(added.status).toBe(201);
  expect(db.select().from(schema.reviewComments).all()).toMatchObject([
    {
      ticketId,
      kind: 'general',
      status: 'draft',
      headSha: 'h1',
      body: 'The spec report found these requirements not met:\n\n- **Tooltip** (missing)\n  Not found.',
    },
  ]);
  db.insert(schema.diffSnapshots).values({ ticketId, baseBranch: 'main', headSha: 'h2' }).run();
  expect(await (await call('POST', `${base}/gaps`)).text()).toContain('outdated');
});
