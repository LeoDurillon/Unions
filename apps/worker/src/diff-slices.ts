// A split ticket's slices in its diff snapshot: each one's own change, from the slice below to its tip.
import { openSlices, parseDiff, type ContainerRuntime, type Db, type DiffFile } from '@union/core';

import { mustRunIn } from './container-exec';
import { REPO_DIR } from './provision';

export type SnapshotSlice = { position: number; title: string; sha: string; files: DiffFile[] };

function git(args: string[]): string[] {
  return ['git', '-C', REPO_DIR, ...args];
}

async function revParse(
  runtime: ContainerRuntime,
  container: string,
  ref: string,
): Promise<string> {
  const output = await mustRunIn(runtime, container, git(['rev-parse', ref]));
  return output.trim();
}

/**
 * Each slice's own diff as the workspace has it now: the lower slices at their local branches (a
 * restack or a rebase just moved them), the top one at HEAD. None when the ticket is not split.
 */
export async function readSlices(
  db: Db,
  runtime: ContainerRuntime,
  input: { container: string; ticketId: number; base: string },
): Promise<SnapshotSlice[]> {
  const { container, ticketId, base } = input;
  const slices = openSlices(db, ticketId);
  if (slices.length < 2) {
    return [];
  }
  const read: SnapshotSlice[] = [];
  let from = `${base}...`;
  for (const [at, slice] of slices.entries()) {
    const tip = await revParse(
      runtime,
      container,
      at === slices.length - 1 ? 'HEAD' : slice.branch,
    );
    const diff = await mustRunIn(
      runtime,
      container,
      git(['diff', '--no-color', '--no-ext-diff', '-M', `${from}${tip}`]),
    );
    read.push({ position: slice.position, title: slice.title, sha: tip, files: parseDiff(diff) });
    from = `${tip}..`;
  }
  return read;
}
