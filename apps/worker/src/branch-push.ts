// Force-pushes a rewritten branch with a lease: the ticket's alone, or every slice of its stack together.
import { listSlices, privatePushFiles, type Project } from '@union/core';

import { PrivateFilesError, projectRemote, pushBranch } from './publish';
import type { Rebase } from './rebase-agent';
import { pushRewrittenStack } from './stack-refs';

/** The project's repository with its credentials, for the fetch and the push. */
export function remoteOf(deps: Rebase['deps'], project: Project): ReturnType<typeof projectRemote> {
  return projectRemote(deps.db, deps.config.gitBaseUrl, project);
}

async function push(rebase: Rebase, lease: string): Promise<void> {
  const { deps, container, project, branch, context } = rebase;
  // Split, even with only the top slice left open: the slices' tips are recorded after the push.
  if (listSlices(deps.db, context.ticket.id).length > 1) {
    await pushRewrittenStack(rebase, lease);
    return;
  }
  await pushBranch(deps.runtime, container, await remoteOf(deps, project), {
    branch,
    lease,
    privateFiles: privatePushFiles(deps.db, context.ticket),
  });
}

/**
 * Force-pushes the rewritten branch, leased on the commit fetched from GitHub; a split ticket's
 * lower slices go in the same atomic push. Why it was refused, or null.
 */
export async function forcePush(rebase: Rebase, lease: string): Promise<string | null> {
  try {
    await push(rebase, lease);
    return null;
  } catch (error) {
    if (error instanceof PrivateFilesError) {
      return error.message;
    }
    return `The push was refused (did someone push to \`${rebase.branch}\` meanwhile?): ${String(error)}`;
  }
}
