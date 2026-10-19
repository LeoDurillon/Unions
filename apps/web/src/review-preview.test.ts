import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDb,
  finishContainerRun,
  getPreview,
  migrateDb,
  recordE2e,
  replaceReviewScreenshots,
  reviewFilesDir,
  schema,
  updatePreview,
  type Db,
} from '@union/core';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { createApp } from './app';
import type { ReviewPreviewView, ReviewRunsView } from './review-preview-types';

type Comment = typeof schema.reviewComments.$inferSelect;

let db: Db;
let app: Hono;
let projectId: number;
let reviewId: number;
let root: string;

const outerRoot = process.env.UNION_ATTACHMENTS_DIR;

/** Back to the test run's temporary folder (`scripts/test-preload.ts`), never the live default. */
function restoreAttachmentsRoot(): void {
  if (outerRoot === undefined) {
    delete process.env.UNION_ATTACHMENTS_DIR;
  } else {
    process.env.UNION_ATTACHMENTS_DIR = outerRoot;
  }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'union-review-files-'));
  process.env.UNION_ATTACHMENTS_DIR = root;
  db = createDb(':memory:');
  migrateDb(db);
  app = createApp(db);
  projectId = db
    .insert(schema.projects)
    .values({
      owner: 'acme',
      repo: 'shop',
      config: {
        baseBranch: 'main',
        preview: { composeFile: 'compose.yaml', env: {}, e2eCommand: 'npm run e2e' },
        scripts: [{ name: 'Seed', command: 'npm run seed' }],
      },
    })
    .returning()
    .get().id;
  reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'PR 7',
      url: 'u',
      author: 'alice',
      headBranch: 'feature',
      baseBranch: 'main',
      headSha: 'bbb2222',
    })
    .returning()
    .get().id;
});

afterEach(async () => {
  restoreAttachmentsRoot();
  await rm(root, { recursive: true, force: true });
});

function send(method: string, route: string, body?: unknown): Promise<Response> | Response {
  return app.request(`/api/projects/${projectId}/pull-requests/reviews/7${route}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function previewView(): Promise<ReviewPreviewView> {
  return (await (await send('GET', '/preview')).json()) as ReviewPreviewView;
}

function commands(): { type: string; ticketId: number | null; payload: unknown }[] {
  return db
    .select()
    .from(schema.commands)
    .all()
    .map(({ type, ticketId, payload }) => ({ type, ticketId, payload }));
}

function setReview(values: Partial<typeof schema.currentReviews.$inferInsert>): void {
  db.update(schema.currentReviews).set(values).where(eq(schema.currentReviews.id, reviewId)).run();
}

test("a review's preview starts once at a time, as a command carrying the review", async () => {
  expect(await previewView()).toMatchObject({
    preview: null,
    configured: true,
    refusal: null,
    checkoutSha: null,
    secrets: null,
    author: 'alice',
  });
  expect((await send('POST', '/preview/start')).status).toBe(202);
  expect(commands()).toEqual([{ type: 'preview_start', ticketId: null, payload: { reviewId } }]);
  const again = await send('POST', '/preview/start');
  expect(again.status).toBe(409);
  expect(await again.text()).toContain('already starting');
  expect((await send('POST', '/preview/stop')).status).toBe(409);
});

test('a review whose files are not read yet cannot start; a fork never gets the secrets', async () => {
  setReview({ headSha: null, fromFork: true, checkoutSha: 'aaa1111', checkoutInRepo: true });
  const shown = await previewView();
  expect(shown.refusal).toContain('files are not read yet');
  expect(shown.secrets).toBe(false);
  expect((await send('POST', '/preview/start')).status).toBe(409);
});

test('the checkout moves to the reviewed commit only when it is behind', async () => {
  expect((await previewView()).updateRefusal).toContain('Nothing is checked out yet');
  setReview({ checkoutSha: 'bbb2222', checkoutInRepo: true });
  expect((await previewView()).updateRefusal).toContain('at the reviewed commit already');
  expect((await previewView()).secrets).toBe(true);
  setReview({ checkoutSha: 'aaa1111' });
  expect((await send('POST', '/preview/update')).status).toBe(202);
  expect(commands().at(-1)).toEqual({
    type: 'review_checkout_update',
    ticketId: null,
    payload: { reviewId },
  });
});

test('the e2e result becomes a draft on the review; its screenshots are served', async () => {
  expect((await send('POST', '/preview/e2e/review')).status).toBe(409);
  updatePreview(db, { reviewId }, { status: 'running' });
  recordE2e(
    db,
    { reviewId },
    { e2eStatus: 'red', e2eOutput: '1 failed', e2eExitCode: 1, e2eScreenshots: 1 },
  );
  await replaceReviewScreenshots(db, reviewId, [{ name: 'home.png', bytes: new Uint8Array([1]) }]);
  expect((await previewView()).screenshots).toEqual([{ name: 'home.png', size: 1 }]);
  const draft = await send('POST', '/preview/e2e/review');
  expect(draft.status).toBe(201);
  const comment = (await draft.json()) as Comment;
  expect(comment).toMatchObject({ reviewId, kind: 'general', status: 'draft', headSha: 'bbb2222' });
  expect(comment.body).toContain('I ran `npm run e2e` on this pull request: it exited with 1.');
  const shot = await send('GET', '/preview/screenshots/home.png');
  expect(shot.headers.get('content-type')).toBe('image/png');
  expect((await send('GET', '/preview/screenshots/other.png')).status).toBe(404);
});

test("commands run in the review's checkout; a finished one's output becomes a draft", async () => {
  expect((await send('POST', '/runs', { command: 'npm test' })).status).toBe(201);
  expect((await send('POST', '/runs', { command: 'ls' })).status).toBe(409);
  const listed = (await (await send('GET', '/runs')).json()) as ReviewRunsView;
  const [run] = listed.runs;
  expect(run).toMatchObject({ reviewId, ticketId: null, command: 'npm test', status: 'queued' });
  if (!run) {
    throw new Error('no run');
  }
  expect((await send('POST', `/runs/${run.id}/review`)).status).toBe(409);
  expect((await send('POST', `/runs/${run.id}/cancel`)).status).toBe(202);
  expect(commands().at(-1)).toEqual({
    type: 'cancel_container_run',
    ticketId: null,
    payload: { containerRunId: run.id },
  });
  finishContainerRun(db, run.id, { status: 'failed', exitCode: 2, error: null, output: 'boom' });
  const draft = await send('POST', `/runs/${run.id}/review`);
  const comment = (await draft.json()) as Comment;
  expect(comment.kind).toBe('general');
  expect(comment.body).toContain('boom');
  expect((await send('POST', '/runs', { scriptName: 'Seed' })).status).toBe(201);
});

test('removing a review asks the worker to remove its container, and drops what it holds', async () => {
  await send('POST', '/preview/start');
  await replaceReviewScreenshots(db, reviewId, [{ name: 'x.png', bytes: new Uint8Array([1]) }]);
  expect((await send('DELETE', '')).status).toBe(200);
  expect(commands()).toEqual([
    {
      type: 'remove_containers',
      ticketId: null,
      payload: {
        containers: [
          {
            name: `union-r${reviewId}`,
            home: `union-r${reviewId}-home`,
            workspace: `union-r${reviewId}-ws`,
          },
        ],
      },
    },
  ]);
  expect(getPreview(db, { reviewId })).toBeNull();
  expect(await stat(reviewFilesDir(reviewId)).catch(() => null)).toBeNull();
});
