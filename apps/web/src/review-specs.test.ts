import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  createTicket,
  linkNotionPage,
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
import type { ReviewSpecView } from './review-spec-types';

const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const GONE = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const github = {
  getDiscussion: () =>
    Promise.resolve({ description: 'Unpublish the other scenarios.', threads: [], notes: [] }),
} as unknown as OnboardingGitHub;

const notion = {
  page: (_token: string, id: string) =>
    id === GONE
      ? Promise.reject(new Error('Could not find page'))
      : Promise.resolve({ id, title: 'Spec CdeTP', url: 'https://n/spec', dataSourceId: null }),
  pageMarkdown: () => Promise.resolve({ markdown: 'Show the threshold.', truncated: false }),
} as unknown as NotionApi;

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

async function specs(path: string): Promise<ReviewSpecView[]> {
  const response = await call('GET', path);
  return (await response.json()) as ReviewSpecView[];
}

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github, notion);
  projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', githubToken: 'ghp_x', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'secret_x', dataSourceId: null });
  ticketId = createTicket(db, {
    projectId,
    title: 'Campaign',
    body: 'Ticket text',
    origin: { kind: 'notion', id: PAGE, url: 'https://n/spec' },
  }).id;
  db.update(schema.tickets).set({ prNumber: 7 }).where(eq(schema.tickets.id, ticketId)).run();
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
});

test("a ticket's specs start from its text and the Notion page it came from, read now", async () => {
  const list = await specs(`/api/tickets/${ticketId}/specs`);
  expect(list.map((spec) => [spec.kind, spec.label, spec.current])).toEqual([
    ['ticket', 'Ticket description', 'Ticket text'],
    ['notion', 'Notion: Spec CdeTP', 'Show the threshold.'],
  ]);
});

test("a pull request's specs are its description and every linked page; one unreadable says why", async () => {
  const base = `/api/projects/${projectId}/pull-requests/reviews/9/specs`;
  const reviewId = db.select().from(schema.currentReviews).get()?.id ?? 0;
  linkNotionPage(db, { kind: 'review', id: reviewId }, { id: PAGE, title: 'Spec', url: null });
  linkNotionPage(db, { kind: 'review', id: reviewId }, { id: GONE, title: 'Old', url: null });
  const list = await specs(base);
  expect(list.map((spec) => [spec.kind, spec.ref])).toEqual([
    ['pr', null],
    ['notion', PAGE],
    ['notion', GONE],
  ]);
  expect(list[0]?.current).toBe('Unpublish the other scenarios.');
  expect(list[2]).toMatchObject({ current: null, error: 'Could not find page' });
});

test('an edited text is kept; a removed start is not added back', async () => {
  const base = `/api/tickets/${ticketId}/specs`;
  const [ticket, page] = await specs(base);
  const saved = await call('PUT', base, {
    specs: [
      { ...ticket, text: 'Only the threshold.' },
      { ...page, removed: true },
    ],
  });
  expect(saved.status).toBe(200);
  const list = await specs(base);
  expect(list.map((spec) => [spec.kind, spec.current, spec.removed])).toEqual([
    ['ticket', 'Only the threshold.', false],
    ['notion', null, true],
  ]);
  expect((await call('PUT', base, { specs: [{ kind: 'wiki', label: 'x' }] })).status).toBe(400);
});
