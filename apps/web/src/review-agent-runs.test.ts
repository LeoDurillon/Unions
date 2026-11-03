import { beforeEach, expect, test } from 'bun:test';

import {
  claimCustomAgentPrompt,
  createCustomAgent,
  createDb,
  createTicket,
  finishCustomAgentPrompt,
  finishReviewAgentRun,
  latestReviewAgentRuns,
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
import type { ReviewAgentsView } from './routes/review-agent-runs';

let db: Db;
let app: Hono;
let projectId: number;
let ticketId: number;
let base: string;

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function view(response: Response | Promise<Response>): Promise<ReviewAgentsView> {
  return (await (await response).json()) as ReviewAgentsView;
}

function agent(name: string, kind: 'step' | 'review'): number {
  const created = createCustomAgent(db, { name, role: 'Review it', kind });
  claimCustomAgentPrompt(db);
  finishCustomAgentPrompt(db, created.id, { prompt: 'Review it.' });
  return created.id;
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  const github = {
    getDiscussion: () => Promise.resolve({ description: 'Unpublish.', threads: [], notes: [] }),
  } as unknown as OnboardingGitHub;
  app = createApp(db, github, {} as NotionApi);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'ghp_x', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 'Campaign', body: 'Ticket text' }).id;
  db.update(schema.tickets).set({ branch: 'feature' }).where(eq(schema.tickets.id, ticketId)).run();
  db.insert(schema.diffSnapshots).values({ ticketId, baseBranch: 'main', headSha: 'h1' }).run();
  base = `/api/tickets/${ticketId}/review-agents`;
});

test('the review page lists the ready review agents only, and runs one on its specs', async () => {
  agent('Plan check', 'step');
  const merge = agent('Merge', 'review');
  expect(await view(call('GET', base))).toEqual({
    agents: [{ id: merge, name: 'Merge' }],
    runs: [],
    refusal: null,
  });
  const started = await call('POST', base, { agentId: merge });
  expect(started.status).toBe(202);
  expect((await view(started)).runs).toMatchObject([
    { agentId: merge, agentName: 'Merge', status: 'queued', specs: ['Ticket description'] },
  ]);
  expect(latestReviewAgentRuns(db, { kind: 'ticket', id: ticketId })[0]?.specs).toMatchObject([
    { id: 1, kind: 'ticket', text: 'Ticket text' },
  ]);
});

test('one run at a time; a finished run is outdated once the change moves', async () => {
  const merge = agent('Merge', 'review');
  await call('POST', base, { agentId: merge });
  const busy = await call('POST', base, { agentId: merge });
  expect(busy.status).toBe(409);
  const [run] = latestReviewAgentRuns(db, { kind: 'ticket', id: ticketId });
  finishReviewAgentRun(db, run?.id ?? 0, { status: 'succeeded', headSha: 'h1', output: '# Ok' });
  expect((await view(call('GET', base))).runs[0]).toMatchObject({
    output: '# Ok',
    outdated: false,
  });
  db.insert(schema.diffSnapshots).values({ ticketId, baseBranch: 'main', headSha: 'h2' }).run();
  expect((await view(call('GET', base))).runs[0]?.outdated).toBe(true);
});

test('runs need no spec; a step agent or a missing id is refused', async () => {
  const merge = agent('Merge', 'review');
  const step = agent('Plan check', 'step');
  const [ticket] = (await (
    await call('GET', `/api/tickets/${ticketId}/specs`)
  ).json()) as ReviewSpecView[];
  await call('PUT', `/api/tickets/${ticketId}/specs`, { specs: [{ ...ticket, removed: true }] });
  expect((await call('POST', base, { agentId: step })).status).toBe(400);
  expect((await call('POST', base, {})).status).toBe(400);
  expect((await view(call('POST', base, { agentId: merge }))).runs[0]?.specs).toEqual([]);
});

test('cancel queues the command for a waiting or running run only', async () => {
  const merge = agent('Merge', 'review');
  const [run] = (await view(call('POST', base, { agentId: merge }))).runs;
  expect((await call('POST', `${base}/${run?.id}/cancel`)).status).toBe(202);
  const commands = db.select().from(schema.commands).all();
  expect(commands.map((command) => [command.type, command.payload])).toEqual([
    ['cancel_review_agent_run', { runId: run?.id }],
  ]);
  finishReviewAgentRun(db, run?.id ?? 0, { status: 'cancelled' });
  expect((await call('POST', `${base}/${run?.id}/cancel`)).status).toBe(409);
  expect((await call('POST', `${base}/999/cancel`)).status).toBe(404);
});

test('a review agent is created with its kind; another kind is refused', async () => {
  const response = await call('POST', '/api/agents/custom', {
    name: 'Merge',
    role: 'Can it merge?',
    kind: 'review',
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ custom: { kind: 'review' } });
  const odd = await call('POST', '/api/agents/custom', { name: 'Odd', role: 'r', kind: 'both' });
  expect(odd.status).toBe(400);
});

test('a pull request under review runs them too, once its files are read', async () => {
  const merge = agent('Merge', 'review');
  db.insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 9,
      title: 'PR',
      url: 'u',
      author: 'alice',
      headBranch: 'b',
      baseBranch: 'main',
    })
    .run();
  const pr = `/api/projects/${projectId}/pull-requests/reviews/9/review-agents`;
  expect((await view(call('GET', pr))).refusal).toContain('Open the diff first');
  expect((await call('POST', pr, { agentId: merge })).status).toBe(409);
  db.update(schema.currentReviews).set({ files: [], headSha: 'p1' }).run();
  expect((await view(call('POST', pr, { agentId: merge }))).runs).toMatchObject([
    { agentName: 'Merge', status: 'queued', specs: ['PR #9 description'] },
  ]);
});
