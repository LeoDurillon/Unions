// Pushes a simplified history, unless the agent left the one already on GitHub.
import { emitEvent } from '@union/core';

import { forcePush } from './branch-push';
import { captureDiff } from './diff-snapshot';
import type { Rebase } from './rebase-agent';
import { headCommit } from './rebase-git';

/** After the push: the event the PR description and the rules follow, and a fresh review diff. */
async function pushed(rebase: Rebase): Promise<void> {
  const { deps, context, container, branch, base } = rebase;
  const ticketId = context.ticket.id;
  emitEvent(deps.db, { type: 'branch_pushed', ticketId, payload: { branch, simplified: true } });
  await captureDiff(deps.db, deps.runtime, { container, ticketId, base }).catch(
    (error: unknown) => {
      context.log({ type: 'union_diff_failed', error: String(error) });
    },
  );
}

/** Pushes the new history unless it is the one on GitHub; why the push failed, or null. */
export async function pushIfRewritten(rebase: Rebase, lease: string): Promise<string | null> {
  if ((await headCommit(rebase.deps.runtime, rebase.container)) === lease) {
    return null;
  }
  const refused = await forcePush(rebase, lease);
  if (refused === null) {
    await pushed(rebase);
  }
  return refused;
}
