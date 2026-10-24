// The pull requests under review of a project as the Pull requests tab lists them: without their
// files, with their preview's state and their linked Notion pages.
import { linkedNotionPages, schema, type Db } from '@union/core';
import { desc, eq, getTableColumns } from 'drizzle-orm';

import type { CurrentReview } from '../api-types';

/** Everything but the files, which only the review page needs. */
const { files: _files, ...LISTED } = getTableColumns(schema.currentReviews);

/** The reviews, newest first, each with its preview's state and its linked Notion pages. */
export function listedReviews(db: Db, projectId: number): CurrentReview[] {
  return db
    .select({ ...LISTED, previewStatus: schema.previews.status })
    .from(schema.currentReviews)
    .leftJoin(schema.previews, eq(schema.previews.reviewId, schema.currentReviews.id))
    .where(eq(schema.currentReviews.projectId, projectId))
    .orderBy(desc(schema.currentReviews.id))
    .all()
    .map((row) =>
      Object.assign(row, { notionPages: linkedNotionPages(db, { kind: 'review', id: row.id }) }),
    );
}
