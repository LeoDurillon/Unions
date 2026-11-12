// Notices when the ticket's branch on GitHub is no longer the commit Union pushed. Either commits
// were added on top, or the branch was rewritten.
import { moveKind, recordMove, stepHoldsBranch, type Db, type Ticket } from '@union/core';

import type { GitHubApi, RepoRef } from './api';

/**
 * Compares the open pull request's head with what Union last pushed, and records a move (or that
 * there is none any more). Not while a step works on the branch: Union may be pushing it. A move
 * already recorded for this head is not asked about again.
 */
export async function checkBranchMoved(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  input: { ticket: Ticket; headSha: string | undefined },
): Promise<void> {
  const { ticket, headSha } = input;
  const pushed = ticket.pushedSha;
  if (headSha === undefined || pushed === null || ticket.prState !== 'open') {
    return;
  }
  if (stepHoldsBranch(ticket.phase) || ticket.remoteMoved?.to === headSha) {
    return;
  }
  if (headSha === pushed) {
    recordMove(db, ticket.id, null);
    return;
  }
  const comparison = await api.compareCommits(repo, pushed, headSha);
  // The checks poll keeps the head it read last: the same one now means the branch stays there.
  const kind = moveKind(comparison, ticket.prChecksSha === headSha);
  recordMove(db, ticket.id, kind ? { from: pushed, to: headSha, kind } : null);
}
