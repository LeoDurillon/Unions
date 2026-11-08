// What goes with a removed pull request under review: its commands not handled yet, its container and volumes, its files.
import { rm } from 'node:fs/promises';

import { ownerContainerNames, reviewFilesDir, schema, type Db } from '@union/core';
import { and, inArray, isNull, sql } from 'drizzle-orm';

/**
 * In the transaction that deletes the reviews: drops their commands the worker has not handled
 * (a start would check a removed review out) and asks the worker to remove their containers and
 * volumes, preview first (the web never touches Docker). Their rows go by cascade.
 */
export function forgetReviews(db: Db, reviewIds: number[]): void {
  if (reviewIds.length === 0) {
    return;
  }
  db.delete(schema.commands)
    .where(
      and(
        isNull(schema.commands.ticketId),
        isNull(schema.commands.handledAt),
        inArray(sql`json_extract(${schema.commands.payload}, '$.reviewId')`, reviewIds),
      ),
    )
    .run();
  const containers = reviewIds.map((reviewId) => {
    const names = ownerContainerNames({ reviewId });
    return { name: names.name, home: names.homeVolume, workspace: names.workspaceVolume };
  });
  db.insert(schema.commands).values({ type: 'remove_containers', payload: { containers } }).run();
}

/** After the transaction: their screenshots and any other file kept for them. */
export async function removeReviewFiles(reviewIds: number[]): Promise<void> {
  await Promise.all(
    reviewIds.map((reviewId) => rm(reviewFilesDir(reviewId), { recursive: true, force: true })),
  );
}
