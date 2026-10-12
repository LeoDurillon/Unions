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
 * Keeps `behind_by` current for tickets that could be rebased (null for the others, or once the PR
 * is closed or merged). An event is recorded only when it changes, so the panel refreshes.
 */
export async function refreshBehind(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  ticket: Ticket,
): Promise<void> {
  const behindBy =
    ticket.prNumber !== null && canRebase(ticket)
      ? await api.pullRequestBehind(repo, ticket.prNumber)
      : null;
  if (behindBy === ticket.behindBy) {
    return;
  }
  db.update(schema.tickets).set({ behindBy }).where(eq(schema.tickets.id, ticket.id)).run();
  emitEvent(db, { type: 'branch_behind', ticketId: ticket.id, payload: { behindBy } });
}
