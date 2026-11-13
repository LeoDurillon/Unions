// Tests setting a property of a review's linked Notion page: queued as the review's, refused for an item not linked.
import { beforeEach, expect, test } from 'bun:test';

import {
  createDb,
  emitEvent,
  linkNotionPage,
  migrateDb,
  saveNotionConnection,
  schema,
  type Db,
  type NotionApi,
  type TrackerProperty,
} from '@union/core';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { OnboardingGitHub } from './github-onboarding';
import { pendingReviewFields } from './tracker-field-commands';

const PAGE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const PRIORITY: TrackerProperty = {
  id: 'prio',
  name: 'Priority',
  type: 'select',
  text: '',
  value: '',
  options: [],
  settable: true,
};

const notion = {
  page: (_token: string, id: string) =>
    Promise.resolve({ id, title: 'Spec', url: '', dataSourceId: null, properties: [PRIORITY] }),
} as unknown as NotionApi;

let db: Db;
let app: Hono;
let reviewId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db, {} as OnboardingGitHub, notion);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'acme', repo: 'shop', config: { baseBranch: 'main' }, githubToken: 'ghp_x' })
    .returning()
    .get().id;
  saveNotionConnection(db, projectId, { token: 'secret', dataSourceId: null });
  reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'PR 7',
      url: 'https://github.com/acme/shop/pull/7',
      author: 'alice',
      headBranch: 'csv',
      baseBranch: 'main',
    })
    .returning()
    .get().id;
  linkNotionPage(db, { kind: 'review', id: reviewId }, { id: PAGE, title: 'Spec', url: null });
  const path = `/api/projects/${projectId}/pull-requests/reviews/7/tracker-fields`;
  set = (body) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
});

let set: (body: object) => Promise<Response> | Response;

test('a linked page’s property is queued as the review’s, and pending until the worker answers', async () => {
  const response = await set({ kind: 'notion', itemId: PAGE, fieldId: 'prio', value: 'P1' });
  expect(response.status).toBe(202);
  const { id } = (await response.json()) as { id: number };
  expect(db.select().from(schema.commands).all().at(-1)).toMatchObject({
    ticketId: null,
    payload: { kind: 'notion', itemId: PAGE, ticketId: null, reviewId, value: 'P1' },
  });
  expect(pendingReviewFields(db, reviewId, PAGE).map((one) => one.commandId)).toEqual([id]);
  expect(pendingReviewFields(db, reviewId, OTHER)).toEqual([]);
  emitEvent(db, {
    type: 'tracker_field_set',
    payload: {
      commandId: id,
      kind: 'notion',
      itemId: PAGE,
      reviewId,
      fieldId: 'prio',
      fieldName: 'Priority',
      text: 'P1',
    },
  });
  expect(pendingReviewFields(db, reviewId, PAGE)).toEqual([]);
});

test('an item the review is not linked to, or a kind Union does not know, is refused', async () => {
  expect((await set({ kind: 'notion', itemId: OTHER, fieldId: 'prio', value: 'P1' })).status).toBe(
    404,
  );
  expect((await set({ kind: 'linear', itemId: PAGE, fieldId: 'prio', value: 'P1' })).status).toBe(
    400,
  );
  expect(db.select().from(schema.commands).all()).toEqual([]);
});
