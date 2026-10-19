import { beforeEach, expect, test } from 'bun:test';

import { createDb, migrateDb, NotionError, schema, type Db, type NotionApi } from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';
import type { ReviewNotionPage } from './review-notion-types';

const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const MENTIONED = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const UNSHARED = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const urlOf = (id: string): string => `https://www.notion.so/${id.replaceAll('-', '')}`;

const notion = {
  page: (_token: string, id: string) =>
    id === UNSHARED
      ? Promise.reject(new NotionError('Could not find page', 404))
      : Promise.resolve({
          id,
          title: id === PAGE ? 'Export to CSV' : 'Data model',
          url: urlOf(id),
          dataSourceId: null,
        }),
  pageMarkdown: () =>
    Promise.resolve({
      markdown: `## Goal\n\nSee <mention-page url="${urlOf(MENTIONED)}"/>.`,
      truncated: false,
    }),
} as unknown as NotionApi;

const github = {
  getDiscussion: () =>
    Promise.resolve({
      description: `Spec: ${urlOf(PAGE)}, data: ${urlOf(MENTIONED)}, hidden: ${urlOf(UNSHARED)}`,
      notes: [],
      threads: [],
    }),
} as unknown as OnboardingGitHub;

let db: Db;
let app: Hono;
let projectId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, github, notion);
  projectId = db
    .insert(schema.projects)
    .values({
      owner: 'acme',
      repo: 'shop',
      config: { baseBranch: 'main' },
      notionToken: 'secret',
      githubToken: 'ghp_x',
    })
    .returning()
    .get().id;
  db.insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'PR 7',
      url: 'https://github.com/acme/shop/pull/7',
      author: 'alice',
      headBranch: 'csv',
      baseBranch: 'main',
    })
    .run();
});

function send(
  method: string,
  path: string,
  body?: unknown,
  number = 7,
): Promise<Response> | Response {
  return app.request(`/api/projects/${projectId}/pull-requests/reviews/${number}/notion${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function stored(): Record<string, string | null> {
  const row = db.select().from(schema.currentReviews).get();
  return { id: row?.notionPageId ?? null, title: row?.notionTitle ?? null };
}

test('a page is checked, linked by URL, read with its mentions titled, and unlinked', async () => {
  expect((await send('GET', '')).status).toBe(404);

  const checked = await send('POST', '/check', { page: urlOf(PAGE) });
  expect(await checked.json()).toEqual({ pageId: PAGE, title: 'Export to CSV', url: urlOf(PAGE) });
  expect(stored()).toEqual({ id: null, title: null });

  expect((await send('PUT', '', { page: urlOf(PAGE) })).status).toBe(200);
  expect(stored()).toEqual({ id: PAGE, title: 'Export to CSV' });

  const page = (await (await send('GET', '')).json()) as ReviewNotionPage;
  expect(page.title).toBe('Export to CSV');
  expect(page.markdown).toContain('[Data model]');
  expect(page.truncated).toBe(false);

  expect((await send('DELETE', '')).status).toBe(200);
  expect(stored()).toEqual({ id: null, title: null });
});

test('an unshared page, a bad URL and a project without Notion are refused', async () => {
  expect((await send('PUT', '', { page: urlOf(UNSHARED) })).status).toBe(404);
  expect((await send('PUT', '', { page: 'not a page' })).status).toBe(400);
  expect(stored()).toEqual({ id: null, title: null });

  db.update(schema.projects).set({ notionToken: null }).run();
  expect((await send('PUT', '', { page: urlOf(PAGE) })).status).toBe(409);
});

function addReview(prNumber: number, headBranch: string, baseBranch: string): void {
  db.insert(schema.currentReviews)
    .values({
      projectId,
      prNumber,
      title: `PR ${prNumber}`,
      url: 'u',
      author: 'a',
      headBranch,
      baseBranch,
    })
    .run();
}

function pages(): Record<number, string | null> {
  return Object.fromEntries(
    db
      .select()
      .from(schema.currentReviews)
      .all()
      .map((row) => [row.prNumber, row.notionPageId]),
  );
}

test('linking the whole stack sets the page on its members without one, nowhere else', async () => {
  addReview(8, 'csv-2', 'csv');
  addReview(9, 'csv-3', 'csv-2');
  addReview(10, 'other', 'main');
  expect((await send('PUT', '', { page: MENTIONED }, 8)).status).toBe(200);

  expect((await send('PUT', '', { page: PAGE, stack: true })).status).toBe(200);
  expect(pages()).toEqual({ 7: PAGE, 8: MENTIONED, 9: PAGE, 10: null });
});

test("the description's readable Notion pages are suggested, never the linked one", async () => {
  const titles = async (): Promise<string[]> =>
    ((await (await send('GET', '/suggestions')).json()) as { title: string }[]).map(
      (page) => page.title,
    );
  expect(await titles()).toEqual(['Export to CSV', 'Data model']);
  await send('PUT', '', { page: PAGE });
  expect(await titles()).toEqual(['Data model']);
});
