// A pull request's e2e failure screenshots: files under its own folder, listed in `preview_screenshots`.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { asc, eq } from 'drizzle-orm';

import { attachmentsRoot, safeFileName, uniqueFileName } from './attachments';
import type { Db } from './db';
import { updatePreview } from './previews';
import * as schema from './tables';

export type PreviewScreenshot = typeof schema.previewScreenshots.$inferSelect;

/** The host folder of a pull request under review's files (`r<id>`, next to the tickets' `t<id>`). */
export function reviewFilesDir(reviewId: number): string {
  return path.join(attachmentsRoot(), `r${reviewId}`);
}

/** Where its e2e screenshots are kept; the next run replaces them. */
export function reviewScreenshotsDir(reviewId: number): string {
  return path.join(reviewFilesDir(reviewId), 'e2e');
}

/** The preview's id, its row made when it has none yet (a run before any start). */
function previewId(db: Db, reviewId: number): number {
  const owner = { reviewId };
  const row =
    db.select().from(schema.previews).where(eq(schema.previews.reviewId, reviewId)).get() ??
    updatePreview(db, owner, { status: 'stopped' });
  return row.id;
}

/** Replaces the review's e2e screenshots with `files` (none: just removes them). */
export async function replaceReviewScreenshots(
  db: Db,
  reviewId: number,
  files: { name: string; bytes: Uint8Array }[],
): Promise<void> {
  const id = previewId(db, reviewId);
  const dir = reviewScreenshotsDir(reviewId);
  await rm(dir, { recursive: true, force: true });
  db.delete(schema.previewScreenshots).where(eq(schema.previewScreenshots.previewId, id)).run();
  if (files.length === 0) {
    return;
  }
  await mkdir(dir, { recursive: true });
  const taken = new Set<string>();
  for (const file of files) {
    const name = uniqueFileName(safeFileName(file.name), taken);
    taken.add(name);
    await writeFile(path.join(dir, name), file.bytes);
    db.insert(schema.previewScreenshots)
      .values({ previewId: id, name, size: file.bytes.byteLength })
      .run();
  }
}

/** The review's screenshots, oldest first. */
export function listReviewScreenshots(db: Db, reviewId: number): PreviewScreenshot[] {
  const preview = db
    .select({ id: schema.previews.id })
    .from(schema.previews)
    .where(eq(schema.previews.reviewId, reviewId))
    .get();
  if (!preview) {
    return [];
  }
  return db
    .select()
    .from(schema.previewScreenshots)
    .where(eq(schema.previewScreenshots.previewId, preview.id))
    .orderBy(asc(schema.previewScreenshots.id))
    .all();
}
