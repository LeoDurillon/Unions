// The pull requests under review of a project as the Pull requests tab lists them, without their
// files. Each comes with its preview's state and its linked tracker items.

import {
  byKind,
  linkedTrackerItems,
  schema,
  type Db,
  type IntegrationKindName,
  type LinkedPage,
} from '@union/core';
import { desc, eq, getTableColumns } from 'drizzle-orm';

import type { CurrentReview } from '../../api-types';

/** Everything but the files, which only the review page needs. */
const { files: _files, ...LISTED } = getTableColumns(schema.currentReviews);

/** The review's linked items, by tracker. */
function linkedItemsOf(db: Db, reviewId: number): Record<IntegrationKindName, LinkedPage[]> {
  return byKind((kind) => linkedTrackerItems(db, { kind: 'review', id: reviewId }, kind));
}

/** The reviews, newest first, each with its preview's state and its linked tracker items. */
export function listedReviews(db: Db, projectId: number): CurrentReview[] {
  return db
    .select({ ...LISTED, previewStatus: schema.previews.status })
    .from(schema.currentReviews)
    .leftJoin(schema.previews, eq(schema.previews.reviewId, schema.currentReviews.id))
    .where(eq(schema.currentReviews.projectId, projectId))
    .orderBy(desc(schema.currentReviews.id))
    .all()
    .map((row) =>
      Object.assign(row, {
        linkedItems: linkedItemsOf(db, row.id),
      }),
    );
}
