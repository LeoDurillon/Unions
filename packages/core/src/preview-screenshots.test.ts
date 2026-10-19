import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDb, migrateDb, type Db } from './db';
import {
  listReviewScreenshots,
  replaceReviewScreenshots,
  reviewScreenshotsDir,
} from './preview-screenshots';
import { getPreview } from './previews';
import * as schema from './tables';

let db: Db;
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
  root = await mkdtemp(path.join(tmpdir(), 'union-shots-'));
  process.env.UNION_ATTACHMENTS_DIR = root;
  db = createDb(':memory:');
  migrateDb(db);
  const projectId = db
    .insert(schema.projects)
    .values({ owner: 'o', repo: 'r', config: { baseBranch: 'main' } })
    .returning()
    .get().id;
  reviewId = db
    .insert(schema.currentReviews)
    .values({
      projectId,
      prNumber: 7,
      title: 'PR',
      url: 'u',
      author: 'a',
      headBranch: 'b',
      baseBranch: 'main',
    })
    .returning()
    .get().id;
});

afterEach(async () => {
  restoreAttachmentsRoot();
  await rm(root, { recursive: true, force: true });
});

const png = (text: string): Uint8Array => new TextEncoder().encode(text);

test("a review's screenshots replace the last run's, under its own folder", async () => {
  await replaceReviewScreenshots(db, reviewId, [
    { name: 'login-fails.png', bytes: png('one') },
    { name: 'login-fails.png', bytes: png('two') },
  ]);
  expect(getPreview(db, { reviewId })?.status).toBe('stopped');
  const dir = reviewScreenshotsDir(reviewId);
  expect(dir).toBe(path.join(root, `r${reviewId}`, 'e2e'));
  const first = listReviewScreenshots(db, reviewId).map(({ name, size }) => [name, size]);
  expect(first).toHaveLength(2);
  expect((await readdir(dir)).toSorted()).toEqual(first.map(([name]) => String(name)).toSorted());

  await replaceReviewScreenshots(db, reviewId, [{ name: '../../x.png', bytes: png('three') }]);
  expect(listReviewScreenshots(db, reviewId).map(({ name }) => name)).toEqual(['x.png']);
  expect(await readdir(dir)).toEqual(['x.png']);

  await replaceReviewScreenshots(db, reviewId, []);
  expect(listReviewScreenshots(db, reviewId)).toEqual([]);
});
