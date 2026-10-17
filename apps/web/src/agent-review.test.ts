import { beforeEach, expect, test } from 'bun:test';

import { claimAgentReview, createDb, createTicket, migrateDb, schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';

let db: Db;
let app: Hono;
let projectId: number;
let ticketId: number;

function send(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function errorOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: string }).error;
}

function addSnapshot(): void {
  db.update(schema.tickets).set({ branch: 'feature' }).where(eq(schema.tickets.id, ticketId)).run();
  db.insert(schema.diffSnapshots).values({ ticketId, baseBranch: 'main', headSha: 'h1' }).run();
}

function addDraft(author: 'user' | 'agent'): number {
  return db
    .insert(schema.reviewComments)
    .values({
      ticketId,
      path: 'a.ts',
      side: 'new',
      startLine: 1,
      endLine: 1,
      excerpt: 'x',
      body: 'Check this.',
      headSha: 'h1',
      author,
    })
    .returning()
    .get().id;
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', githubProjectNodeId: 'P', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  ticketId = createTicket(db, { projectId, title: 't' }).id;
  app = createApp(db);
});

test('the agent reviews a ticket once it has a diff and no run works in its workspace', async () => {
  const base = `/api/tickets/${ticketId}/agent-review`;
  expect(await (await send('GET', base)).json()).toBeNull();
  const early = await send('POST', base);
  expect(early.status).toBe(409);
  expect(await errorOf(early)).toContain('No diff to review yet');

  addSnapshot();
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect(await errorOf(await send('POST', base))).toContain('Wait for the current run');

  db.update(schema.tickets)
    .set({ phase: { kind: 'awaiting_approval', step: 'final_review' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  const queued = await send('POST', base);
  expect(queued.status).toBe(202);
  expect(await queued.json()).toMatchObject({ status: 'queued' });
  expect((await send('POST', base)).status).toBe(409);
});

test('the specs sent are kept with the run, and shown with it; bad ones are refused', async () => {
  const base = `/api/tickets/${ticketId}/agent-review`;
  addSnapshot();
  const spec = { kind: 'ticket', label: 'Ticket description', text: 'Search by name.' };
  const bad = await send('POST', base, { specs: [{ ...spec, text: '' }] });
  expect(bad.status).toBe(400);
  expect(await errorOf(bad)).toBe('Spec 1: a label and a text are needed');
  const queued = await send('POST', base, { specs: [spec] });
  expect(await queued.json()).toMatchObject({ specs: [{ ...spec, prs: [] }] });
});

test('cancelling hands the worker a command; nothing to cancel is refused', async () => {
  const base = `/api/tickets/${ticketId}/agent-review`;
  expect((await send('POST', `${base}/cancel`)).status).toBe(409);
  addSnapshot();
  await send('POST', base);
  claimAgentReview(db);
  expect((await send('POST', `${base}/cancel`)).status).toBe(202);
  const [command] = db.select().from(schema.commands).all();
  expect(command).toMatchObject({ type: 'cancel_agent_review', payload: { agentReviewId: 1 } });
});

test('keeping or editing a suggestion makes it the user’s', async () => {
  const kept = addDraft('agent');
  const edited = addDraft('agent');
  const base = `/api/tickets/${ticketId}/comments`;
  expect(await (await send('POST', `${base}/${kept}/keep`)).json()).toMatchObject({
    author: 'user',
  });
  await send('PATCH', `${base}/${edited}`, { body: 'Reworded.' });
  const authors = db
    .select()
    .from(schema.reviewComments)
    .all()
    .map((comment) => comment.author);
  expect(authors).toEqual(['user', 'user']);
});

test("a pull request's review needs its files read first", async () => {
  const review = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 't',
      url: 'u',
      author: 'a',
      headBranch: 'h',
      baseBranch: 'main',
    })
    .returning()
    .get();
  const base = `/api/projects/${projectId}/pull-requests/reviews/7/agent-review`;
  expect(await errorOf(await send('POST', base))).toContain('Open the diff first');
  db.update(schema.currentReviews)
    .set({ files: [], headSha: 'h1' })
    .where(eq(schema.currentReviews.id, review.id))
    .run();
  expect((await send('POST', base)).status).toBe(202);
  expect(await (await send('GET', base)).json()).toMatchObject({ status: 'queued' });
});
