// A split ticket's slice branches in its workspace: set from the recorded tips, checked, pushed together, recorded again.
import {
  openSlices,
  privatePushFiles,
  schema,
  type ContainerRuntime,
  type TicketSlice,
} from '@union/core';
import { eq } from 'drizzle-orm';

import { mustRunIn } from './container-exec';
import { REPO_DIR } from './provision';
import { projectRemote } from './publish';
import type { Rebase } from './rebase-agent';
import { headCommit } from './rebase-git';
import { setBranches } from './stack-git';
import { pushStack } from './stack-push';

/** The slices below the top one (the ticket's own branch); empty when the ticket is not split. */
export function lowerSlices(db: Rebase['deps']['db'], ticketId: number): TicketSlice[] {
  return openSlices(db, ticketId).slice(0, -1);
}

/** Puts each lower slice's local branch where it was last pushed, so a rebase moves it from there. */
export function syncLowerBranches(
  runtime: ContainerRuntime,
  container: string,
  lower: readonly TicketSlice[],
): Promise<void> {
  return setBranches(
    runtime,
    container,
    lower.map((slice) => ({ branch: slice.branch, sha: slice.tipSha })),
  );
}

/** Records where every slice's branch now is: the lower ones' branches, the top one's HEAD. */
export async function recordTips(rebase: Rebase): Promise<void> {
  const { deps, container, context } = rebase;
  const slices = openSlices(deps.db, context.ticket.id);
  const head = await headCommit(deps.runtime, container);
  for (const [at, slice] of slices.entries()) {
    const own = at === slices.length - 1 ? null : slice.branch;
    const tip =
      own === null
        ? head
        : await mustRunIn(deps.runtime, container, ['git', '-C', REPO_DIR, 'rev-parse', own]);
    deps.db
      .update(schema.ticketSlices)
      .set({ tipSha: tip.trim() })
      .where(eq(schema.ticketSlices.id, slice.id))
      .run();
  }
}

/**
 * Pushes the rewritten stack in one atomic push: each lower slice leased on its recorded tip (what
 * was last pushed), the ticket's branch on `lease`; then records the new tips.
 */
export async function pushRewrittenStack(rebase: Rebase, lease: string): Promise<void> {
  const { deps, container, project, context, branch } = rebase;
  const lower = lowerSlices(deps.db, context.ticket.id);
  const remote = await projectRemote(deps.db, deps.config.gitBaseUrl, project);
  await pushStack(deps.runtime, container, remote, {
    branches: [
      ...lower.map((slice) => ({ branch: slice.branch, lease: slice.tipSha })),
      { branch, lease },
    ],
    privateFiles: privatePushFiles(deps.db, context.ticket),
  });
  await recordTips(rebase);
}
