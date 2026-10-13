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

/** What GitHub says of the ticket's pull request now; what is known already when it is settled. */
async function polled(
  api: GitHubApi,
  repo: RepoRef,
  ticket: Ticket,
): Promise<Pick<Ticket, 'prState' | 'prMergedAt' | 'behindBy'>> {
  const settled = ticket.prState === 'merged' && ticket.prMergedAt !== null;
  const status =
    ticket.prNumber === null || settled
      ? null
      : await api.pullRequestStatus(repo, ticket.prNumber, canRebase(ticket));
  const prState = ticket.prNumber === null ? null : (status?.state ?? ticket.prState);
  return {
    prState,
    prMergedAt: prState === 'merged' ? (status?.mergedAt ?? ticket.prMergedAt) : null,
    behindBy: status?.behindBy ?? null,
  };
}

/**
 * Keeps the pull request's state (`pr_state`), when it was merged (`pr_merged_at`) and, for tickets
 * that could be rebased, how far behind it is (`behind_by`) current. A merged pull request is final,
 * so once its merge date is known it is no longer asked about. An event is recorded only on a change,
 * so the panel and the board refresh.
 */
export async function refreshPullRequest(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  ticket: Ticket,
): Promise<void> {
  const { prState, prMergedAt, behindBy } = await polled(api, repo, ticket);
  if (
    prState === ticket.prState &&
    prMergedAt === ticket.prMergedAt &&
    behindBy === ticket.behindBy
  ) {
    return;
  }
  db.update(schema.tickets)
    .set({ prState, prMergedAt, behindBy })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  emitEvent(db, {
    type: 'pull_request_status',
    ticketId: ticket.id,
    payload: { prState, prMergedAt, behindBy },
  });
  if (prState !== ticket.prState) {
    recordEnd(db, ticket, prState);
  }
}

/** The ends of a pull request, as events of their own (the event rules wait for them). */
function recordEnd(db: Db, ticket: Ticket, prState: Ticket['prState']): void {
  if (prState === 'merged' || prState === 'closed') {
    emitEvent(db, {
      type: prState === 'merged' ? 'pull_request_merged' : 'pull_request_closed',
      ticketId: ticket.id,
      payload: { number: ticket.prNumber },
    });
  }
}
