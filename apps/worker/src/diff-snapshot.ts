import {
  emitEvent,
  parseDiff,
  schema,
  type ContainerRuntime,
  type Db,
  type DiffFile,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { mustRunIn } from './container-exec';
import { readCommits, type SnapshotCommits } from './diff-commits';
import { REPO_DIR } from './provision';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

function insertCommit(
  tx: Tx,
  snapshotId: number,
  commit: Omit<typeof schema.diffCommits.$inferInsert, 'snapshotId'>,
  files: DiffFile[],
): void {
  const row = tx
    .insert(schema.diffCommits)
    .values({ snapshotId, ...commit })
    .returning()
    .get();
  for (const [index, file] of files.entries()) {
    tx.insert(schema.diffCommitFiles)
      .values({ commitId: row.id, position: index, ...file })
      .run();
  }
}

/** The change since the last review first, then the commits, oldest first. */
function insertCommits(
  tx: Tx,
  snapshotId: number,
  { commits, sinceReview }: SnapshotCommits,
): void {
  if (sinceReview) {
    insertCommit(
      tx,
      snapshotId,
      { kind: 'since_review', position: 0, sha: sinceReview.sha, title: 'Since last review' },
      sinceReview.files,
    );
  }
  for (const [index, { files, ...commit }] of commits.entries()) {
    insertCommit(tx, snapshotId, { kind: 'commit', position: index + 1, ...commit }, files);
  }
}

/**
 * Replaces the ticket's diff snapshot with `base...HEAD` as it is now in the container, with each
 * commit's own diff and the change since the head the user last reviewed. The commits are extra: a
 * failure to read them keeps the whole diff.
 */
export async function captureDiff(
  db: Db,
  runtime: ContainerRuntime,
  input: { container: string; ticketId: number; base: string },
): Promise<void> {
  const { container, ticketId, base } = input;
  const head = await mustRunIn(runtime, container, git(['rev-parse', 'HEAD']));
  const headSha = head.trim();
  const diff = await mustRunIn(
    runtime,
    container,
    git(['diff', '--no-color', '--no-ext-diff', '-M', `${base}...HEAD`]),
  );
  const files = parseDiff(diff);
  const reviewed =
    db
      .select({ sha: schema.tickets.reviewedSha })
      .from(schema.tickets)
      .where(eq(schema.tickets.id, ticketId))
      .get()?.sha ?? null;
  const commits = await readCommits(runtime, container, { base, head: headSha, reviewed }).catch(
    (): SnapshotCommits => ({ commits: [], sinceReview: null }),
  );
  db.transaction((tx) => {
    tx.delete(schema.diffSnapshots).where(eq(schema.diffSnapshots.ticketId, ticketId)).run();
    const snapshot = tx
      .insert(schema.diffSnapshots)
      .values({ ticketId, baseBranch: base, headSha })
      .returning()
      .get();
    for (const [position, file] of files.entries()) {
      tx.insert(schema.diffFiles)
        .values({ snapshotId: snapshot.id, position, ...file })
        .run();
    }
    insertCommits(tx, snapshot.id, commits);
    emitEvent(tx, { type: 'diff_updated', ticketId, payload: { headSha, files: files.length } });
  });
}
