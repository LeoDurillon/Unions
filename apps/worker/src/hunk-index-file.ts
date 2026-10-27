// Runs a review agent's work on the change's files with their hunk index written in the checkout, then
// removes it and closes the target.
import type { ContainerRuntime } from '@union/core';

import type { ReviewTarget } from './agent-review-target';
import { mustRunIn } from './container-exec';
import { REPO_DIR } from './provision';
import { HUNK_INDEX, hunkIndex } from './review-grouping-format';

/** A changed file and its patch. */
export type ChangedFile = { path: string; patch: string };

export async function withHunkIndex<T>(
  runtime: ContainerRuntime,
  target: ReviewTarget,
  work: (files: ChangedFile[]) => Promise<T>,
): Promise<T> {
  const files = target.paths.map((path) => ({ path, patch: target.patchOf(path) ?? '' }));
  const index = `${REPO_DIR}/${HUNK_INDEX}`;
  try {
    await mustRunIn(runtime, target.container, ['sh', '-c', `cat > ${index}`], {
      stdin: hunkIndex(files),
    });
    return await work(files);
  } finally {
    // A ticket's container stays: its workspace is left as the agent found it.
    await mustRunIn(runtime, target.container, ['rm', '-f', index]).catch(() => '');
    await target.close();
  }
}
