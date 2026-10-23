// The diff a ticket's comments are anchored in: its whole change, or one slice's own change when split.
import { listSlices, schema, type Db } from '@union/core';
import { and, desc, eq } from 'drizzle-orm';

/** A diff's head commit and each file's patch by path. */
export type Snapshot = { headSha: string; patches: Map<string, string> };

/** Where comments imported from one pull request land: the slice it is, and that diff. */
export type ImportAnchor = { snapshot: Snapshot | null; slicePosition: number | null };

function newestSnapshot(db: Db, ticketId: number): { id: number; headSha: string } | undefined {
  return db
    .select({ id: schema.diffSnapshots.id, headSha: schema.diffSnapshots.headSha })
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.ticketId, ticketId))
    .orderBy(desc(schema.diffSnapshots.id))
    .get();
}

/** The ticket's whole change in its newest snapshot. */
export function loadSnapshot(db: Db, ticketId: number): Snapshot | null {
  const snapshot = newestSnapshot(db, ticketId);
  if (!snapshot) {
    return null;
  }
  const files = db
    .select()
    .from(schema.diffFiles)
    .where(eq(schema.diffFiles.snapshotId, snapshot.id))
    .all();
  return {
    headSha: snapshot.headSha,
    patches: new Map(files.map((file) => [file.path, file.patch])),
  };
}

function sliceRows(db: Db, ticketId: number): (typeof schema.diffCommits.$inferSelect)[] {
  const snapshotId = newestSnapshot(db, ticketId)?.id;
  if (snapshotId === undefined) {
    return [];
  }
  return db
    .select()
    .from(schema.diffCommits)
    .where(and(eq(schema.diffCommits.snapshotId, snapshotId), eq(schema.diffCommits.kind, 'slice')))
    .all();
}

/** Each slice's tip in the newest snapshot, by position: a slice comment on another is outdated. */
export function sliceTips(db: Db, ticketId: number): Map<number, string> {
  return new Map(sliceRows(db, ticketId).map((row) => [row.position, row.sha]));
}

/** The slices in the newest snapshot, bottom first, with their pull requests: what a review names. */
export function reviewSlices(
  db: Db,
  ticketId: number,
): { position: number; title: string; sha: string; prNumber: number | null }[] {
  const slices = listSlices(db, ticketId);
  return sliceRows(db, ticketId)
    .toSorted((a, b) => a.position - b.position)
    .map(({ position, title, sha }) => ({
      position,
      title,
      sha,
      prNumber: slices.find((slice) => slice.position === position)?.prNumber ?? null,
    }));
}

/** One slice's own change (from the slice below to its tip) in the newest snapshot. */
export function sliceSnapshot(db: Db, ticketId: number, position: number): Snapshot | null {
  const row = sliceRows(db, ticketId).find((candidate) => candidate.position === position);
  if (!row) {
    return null;
  }
  const files = db
    .select()
    .from(schema.diffCommitFiles)
    .where(eq(schema.diffCommitFiles.commitId, row.id))
    .all();
  return { headSha: row.sha, patches: new Map(files.map((file) => [file.path, file.patch])) };
}

/**
 * A slice's pull request anchors on that slice's own change (each pull request of a stack shows
 * only its slice); on a ticket not split, the whole change.
 */
export function importAnchor(db: Db, ticketId: number, prNumber: number): ImportAnchor {
  const slice = listSlices(db, ticketId).find((candidate) => candidate.prNumber === prNumber);
  if (!slice) {
    return { snapshot: loadSnapshot(db, ticketId), slicePosition: null };
  }
  return {
    snapshot: sliceSnapshot(db, ticketId, slice.position),
    slicePosition: slice.position,
  };
}
