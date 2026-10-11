import { emitEvent, parseDiff, schema, type ContainerRuntime, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

import { mustRunIn } from './container-exec';
import { REPO_DIR } from './provision';

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

/** Replaces the ticket's diff snapshot with `base...HEAD` as it is now in the container. */
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
    emitEvent(tx, { type: 'diff_updated', ticketId, payload: { headSha, files: files.length } });
  });
}
