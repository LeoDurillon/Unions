import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  finishGrouping,
  latestGrouping,
  migrateDb,
  saveNotionConnection,
  schema,
  type Db,
  type NotionApi,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';

const github = {
  getDiscussion: () =>
    Promise.resolve({
      description: 'Unpublish the other scenarios.\n\nCloses #12',
      threads: [],
      notes: [],
    }),
  getIssue: (_auth: unknown, _repo: unknown, number: number) =>
    Promise.resolve(
      number === 12
        ? {
            number,
            nodeId: 'I_12',
            title: 'Campaign',
            body: 'Disable publishing.',
            url: 'u',
            state: 'open',
            pullRequest: false,
          }
        : null,
    ),
} as unknown as OnboardingGitHub;

const notion = {
  page: (_token: string, id: string) =>
    Promise.resolve({ id, title: 'Spec CdeTP', url: 'u', dataSourceId: 'elsewhere' }),
  pageMarkdown: () =>
    Promise.resolve({ markdown: 'See <mention-page url="https://x/p"/>', truncated: false }),
} as unknown as NotionApi;

let db: Db;
let app: Hono;
let ticketId: number;

function call(method: string, path: string, body?: unknown): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github, notion);
  const projectId = db
    .insert(schema.projects)
    .values({
      owner: 'acme',
      repo: 'shop',
      githubToken: 'ghp_x',
      config: { baseBranch: 'main' },
    })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'secret_x', dataSourceId: null });
  ticketId = createTicket(db, { projectId, title: 'Campaign', body: 'Ticket text' }).id;
  db.update(schema.tickets)
    .set({ branch: 'feature', prNumber: 7 })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  db.insert(schema.diffSnapshots).values({ ticketId, baseBranch: 'main', headSha: 'h1' }).run();
});

test('each source reads its text: the PR without Union links, an issue, any Notion page', async () => {
  const base = `/api/tickets/${ticketId}/groupings/source`;
  expect(await (await call('POST', base, { kind: 'pr' })).json()).toEqual({
    kind: 'pr',
    label: 'PR #7 description',
    text: 'Unpublish the other scenarios.',
  });
  expect(await (await call('POST', base, { kind: 'ticket' })).json()).toMatchObject({
    text: 'Ticket text',
  });
  expect(await (await call('POST', base, { kind: 'issue', ref: '#12' })).json()).toMatchObject({
    label: 'Issue #12: Campaign',
    text: 'Disable publishing.',
  });
  expect((await call('POST', base, { kind: 'issue', ref: '99' })).status).toBe(404);
  const page = await call('POST', base, {
    kind: 'notion',
    ref: 'https://www.notion.so/aaaaaaaabbbb4ccc8dddeeeeeeeeeeee',
  });
  expect(await page.json()).toMatchObject({
    label: 'Notion: Spec CdeTP',
    text: 'See [Notion page](https://x/p)',
  });
});

test("a Notion page with no URL is the one linked to the review, or the ticket's", async () => {
  const ticketBase = `/api/tickets/${ticketId}/groupings/source`;
  expect((await call('POST', ticketBase, { kind: 'notion' })).status).toBe(400);
  db.update(schema.tickets)
    .set({ originKind: 'notion', originId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect(await (await call('POST', ticketBase, { kind: 'notion' })).json()).toMatchObject({
    label: 'Notion: Spec CdeTP',
  });

  const projectId = db.select().from(schema.projects).get()?.id ?? 1;
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
  const reviewBase = `/api/projects/${projectId}/pull-requests/reviews/9/groupings/source`;
  expect((await call('POST', reviewBase, { kind: 'notion', ref: '' })).status).toBe(400);
  db.update(schema.currentReviews)
    .set({ notionPageId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })
    .run();
  expect(await (await call('POST', reviewBase, { kind: 'notion', ref: '' })).json()).toMatchObject({
    kind: 'notion',
    label: 'Notion: Spec CdeTP',
  });
});

test('a grouping is queued with the text as edited, once at a time, and is outdated once the change moves', async () => {
  const base = `/api/tickets/${ticketId}/groupings`;
  const started = await call('POST', base, {
    kind: 'pr',
    label: 'PR #7 description',
    spec: 'Only this.',
  });
  expect(started.status).toBe(202);
  expect((await call('POST', base, { kind: 'pr', spec: 'Again' })).status).toBe(409);
  const queued = latestGrouping(db, { kind: 'ticket', id: ticketId });
  expect(queued).toMatchObject({ status: 'queued', spec: 'Only this.', sourceKind: 'pr' });

  finishGrouping(db, queued?.id ?? 0, {
    status: 'succeeded',
    headSha: 'h1',
    result: { groups: [], unrelated: [], missing: [] },
  });
  expect(await (await call('GET', base)).json()).toMatchObject({
    status: 'succeeded',
    outdated: false,
  });
  db.insert(schema.diffSnapshots).values({ ticketId, baseBranch: 'main', headSha: 'h2' }).run();
  expect(await (await call('GET', base)).json()).toMatchObject({ outdated: true });
});

test('no grouping while a run uses the workspace; cancelling one is a command for the worker', async () => {
  const base = `/api/tickets/${ticketId}/groupings`;
  db.update(schema.tickets)
    .set({ phase: { kind: 'running', step: 'implement' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  expect((await call('POST', base, { kind: 'ticket', spec: 'x' })).status).toBe(409);
  db.update(schema.tickets)
    .set({ phase: { kind: 'done' } })
    .where(eq(schema.tickets.id, ticketId))
    .run();
  await call('POST', base, { kind: 'ticket', spec: 'x' });
  expect((await call('POST', `${base}/cancel`)).status).toBe(202);
  expect(
    db
      .select()
      .from(schema.commands)
      .all()
      .map((row) => row.type),
  ).toContain('cancel_review_grouping');
});
