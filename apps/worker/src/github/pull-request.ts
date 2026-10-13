import { emitEvent, schema, type Db, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, RepoRef } from './api';

/** After the final approval the draft PR becomes ready for review, once. */
export async function markReadyWhenDone(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  ticket: Ticket,
): Promise<void> {
  if (ticket.phase.kind !== 'done' || ticket.prNumber === null || ticket.prReadyAt !== null) {
    return;
  }
  await api.markPullRequestReady(repo, ticket.prNumber);
  db.update(schema.tickets)
    .set({ prReadyAt: Date.now() })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  emitEvent(db, {
    type: 'pull_request_ready',
    ticketId: ticket.id,
    payload: { number: ticket.prNumber },
  });
}

/** Where the user could ask for a rebase: at the final review, done with the PR open, or after a failed one. */
function canRebase(ticket: Ticket): boolean {
  const { phase } = ticket;
  return (
    phase.kind === 'done' ||
    (phase.kind === 'awaiting_approval' && phase.step === 'final_review') ||
    (phase.kind === 'failed' && phase.step === 'rebase')
  );
}

/**
 * Keeps the pull request's state (`pr_state`) and, for tickets that could be rebased, how far behind
 * it is (`behind_by`) current. A merged pull request is final, so it is no longer asked about. An
 * event is recorded only on a change, so the panel refreshes.
 */
export async function refreshPullRequest(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  ticket: Ticket,
): Promise<void> {
  const status =
    ticket.prNumber === null || ticket.prState === 'merged'
      ? null
      : await api.pullRequestStatus(repo, ticket.prNumber, canRebase(ticket));
  const prState = ticket.prNumber === null ? null : (status?.state ?? ticket.prState);
  const behindBy = status?.behindBy ?? null;
  if (prState === ticket.prState && behindBy === ticket.behindBy) {
    return;
  }
  db.update(schema.tickets)
    .set({ prState, behindBy })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  emitEvent(db, {
    type: 'pull_request_status',
    ticketId: ticket.id,
    payload: { prState, behindBy },
  });
}
