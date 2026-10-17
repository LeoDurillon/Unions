import { beforeEach, expect, test } from 'bun:test';

import { createDb, createTicket, migrateDb, schema, type Db, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { CiGivenView, CiPreview, PrChecksView, PullRequestChecks } from './ci-api-types';
import type { CheckRunRead, CiGitHub } from './github-checks';

const JOB_URL = 'https://github.com/acme/shop/actions/runs/5/job/';

const LISTING: PullRequestChecks = {
  headSha: 'abc123',
  checks: [
    {
      id: 'run:11',
      name: 'Fail on findings',
      state: 'failed',
      conclusion: 'failure',
      summary: null,
      url: `${JOB_URL}11`,
      workflowRunId: 5,
      durationMs: 1000,
    },
    {
      id: 'run:12',
      name: 'Knip report',
      state: 'passed',
      conclusion: 'success',
      summary: null,
      url: `${JOB_URL}12`,
      workflowRunId: 5,
      durationMs: 9000,
    },
    {
      id: 'status:deploy',
      name: 'deploy',
      state: 'failed',
      conclusion: 'error',
      summary: 'Build broke',
      url: 'https://ci/1',
      workflowRunId: null,
      durationMs: null,
    },
  ],
  botComments: [
    {
      id: 77,
      author: 'github-actions[bot]',
      url: 'https://x/77',
      updatedAt: '2026-10-16T10:00:00Z',
      excerpt: '# Report',
    },
  ],
};

const RUN: CheckRunRead = {
  name: 'Fail on findings',
  conclusion: 'failure',
  url: `${JOB_URL}11`,
  output: { title: null, summary: null, text: null },
  annotations: [{ path: 'src/a.ts', startLine: 3, level: 'failure', message: 'unused export' }],
  isActions: true,
};

const LOGS: Record<number, string> = {
  11: '##[group]Run knip-gate\nscript\n##[endgroup]\nKnip found unused code\n##[error]Process completed with exit code 1.',
  12: '##[group]Run knip\nscript\n##[endgroup]\nUnused exports (1)\nfoo  src/a.ts:3',
};

let calls: string[] = [];
let forbidden = false;

const ci: CiGitHub = {
  listChecks: (_auth, _repo, number) => {
    calls.push(`list ${number}`);
    if (forbidden) {
      return Promise.reject(
        Object.assign(new Error('Resource not accessible by integration'), { status: 403 }),
      );
    }
    return Promise.resolve(number === 7 ? LISTING : null);
  },
  readCheckRun: (_auth, _repo, id) => Promise.resolve(id === 11 ? RUN : null),
  readJobLog: (_auth, _repo, id) => {
    calls.push(`log ${id}`);
    return Promise.resolve(LOGS[id] ?? null);
  },
  readComment: (_auth, _repo, id) =>
    Promise.resolve(
      id === 77
        ? { author: 'github-actions[bot]', url: 'https://x/77', body: '# Report\nunused: foo' }
        : null,
    ),
};

let db: Db;
let app: Hono;
let ticketId: number;

beforeEach(() => {
  calls = [];
  forbidden = false;
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, undefined, undefined, ci);
  const project = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'tok', config: { baseBranch: 'main' } })
    .returning()
    .get();
  ticketId = createTicket(db, { projectId: project.id, title: 'T' }).id;
  setTicket({ prNumber: 7, phase: { kind: 'done' } });
});

function setTicket(values: Partial<Ticket>): void {
  db.update(schema.tickets).set(values).where(eq(schema.tickets.id, ticketId)).run();
}

function post(path: string, body: unknown): Response | Promise<Response> {
  return app.request(`/api/tickets/${ticketId}/pr-checks${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const PICKS = [
  { kind: 'check', id: 'run:11' },
  { kind: 'job', id: '12' },
  { kind: 'comment', id: '77' },
];

test('the checks of the pull request, with what was given and whether a send can go', async () => {
  const res = await app.request(`/api/tickets/${ticketId}/pr-checks`);
  expect(res.status).toBe(200);
  const view = (await res.json()) as PrChecksView;
  expect(view).toMatchObject({ number: 7, headSha: 'abc123', given: [], canSend: true });
  expect(view.checks).toHaveLength(3);
});

test('a preview builds each text from GitHub and stores nothing', async () => {
  const res = await post('/preview', { picks: [...PICKS, { kind: 'check', id: 'status:deploy' }] });
  expect(res.status).toBe(200);
  const { items } = (await res.json()) as CiPreview;
  expect(items.map((item) => [item.kind, item.name])).toEqual([
    ['check', 'Fail on findings'],
    ['job', 'Knip report'],
    ['comment', 'github-actions[bot], comment 77'],
    ['check', 'deploy'],
  ]);
  expect(items[0]?.text).toContain('- src/a.ts:3: failure: unused export');
  expect(items[0]?.text).toContain('Knip found unused code');
  expect(items[1]?.text).toContain('foo  src/a.ts:3');
  expect(items[1]?.text).not.toContain('script');
  expect(items[2]?.text).toContain('unused: foo');
  expect(items[3]?.text).toContain('Build broke');
  expect(calls).toContain('log 11');
  expect(db.select().from(schema.ciOutputs).all()).toHaveLength(0);
});

test('a passing check, or one not on the last commit, is refused', async () => {
  expect((await post('/preview', { picks: [{ kind: 'check', id: 'run:12' }] })).status).toBe(409);
  expect((await post('/preview', { picks: [{ kind: 'check', id: 'run:99' }] })).status).toBe(404);
  expect((await post('/preview', { picks: [{ kind: 'job', id: '99' }] })).status).toBe(404);
  expect((await post('/preview', { picks: [] })).status).toBe(400);
  expect((await post('/preview', { picks: [{ kind: 'log', id: '1' }] })).status).toBe(400);
});

test('keeping stores the texts for the next run; dropping takes one back', async () => {
  const kept = (await (await post('/keep', { picks: PICKS })).json()) as CiGivenView;
  expect(kept.given.map((one) => [one.kind, one.forAgent, one.headSha])).toEqual([
    ['comment', 'next_run', 'abc123'],
    ['job', 'next_run', 'abc123'],
    ['check', 'next_run', 'abc123'],
  ]);
  const id = kept.given[0]?.id ?? -1;
  const dropped = (await (await post(`/given/${id}/drop`, {})).json()) as CiGivenView;
  expect(dropped.given).toHaveLength(2);
  expect(db.select().from(schema.commands).all()).toHaveLength(0);
});

test('sending queues one revision with the note, refused when the implementer cannot take it', async () => {
  setTicket({ phase: { kind: 'running', step: 'implement' } });
  expect((await post('/send', { picks: PICKS })).status).toBe(409);
  setTicket({ phase: { kind: 'done' } });
  const res = await post('/send', { picks: PICKS, note: 'Fix the unused export' });
  expect(res.status).toBe(202);
  const commands = db.select().from(schema.commands).all();
  expect(commands).toMatchObject([
    { type: 'revise', payload: { feedback: 'Fix the unused export' } },
  ]);
  expect((await post('/send', { picks: PICKS })).status).toBe(409);
});

test('a failed Actions job is queued for the worker to run again, once while it waits', async () => {
  expect((await post('/rerun', { checkId: 'run:11' })).status).toBe(202);
  expect(db.select().from(schema.commands).all()).toMatchObject([
    { type: 'rerun_ci_job', ticketId, payload: { jobId: 11, name: 'Fail on findings' } },
  ]);
  expect((await post('/rerun', { checkId: 'run:11' })).status).toBe(409);
  // Passed, not an Actions job, not on the pull request.
  for (const checkId of ['run:12', 'status:deploy', 'run:99']) {
    expect((await post('/rerun', { checkId })).status).toBe(409);
  }
});

test('without a pull request, or when GitHub refuses, the reason is said', async () => {
  forbidden = true;
  const refused = await app.request(`/api/tickets/${ticketId}/pr-checks`);
  expect(refused.status).toBe(502);
  expect(((await refused.json()) as { error: string }).error).toContain(
    'Checks, Commit statuses and Actions',
  );
  setTicket({ prNumber: null });
  expect((await app.request(`/api/tickets/${ticketId}/pr-checks`)).status).toBe(409);
});
