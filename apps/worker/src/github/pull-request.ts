// Keeps the pull request's state (`pr_state`), when it was merged (`pr_merged_at`) or closed
// without a merge (`pr_closed_at`, polled still: it can be reopened) and, for tickets that could be
// rebased, how far behind it is (`behind_by`) current.
import { emitEvent, listSlices, schema, type Db, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, PullRequestStatus, RepoRef } from './api';
import { followBase } from './follow-base';
import { refreshChecks } from './pull-request-checks';
import { pollStack, startRestack } from './stack-pull-requests';

/** After the final approval the draft PR becomes ready for review, once; a stack's other slices too. */
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
  for (const slice of listSlices(db, ticket.id)) {
    if (slice.prNumber !== null && slice.prNumber !== ticket.prNumber && slice.prState === 'open') {
      await api.markPullRequestReady(repo, slice.prNumber);
    }
  }
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
    (phase.kind === 'failed' && (phase.step === 'rebase' || phase.step === 'retarget'))
  );
}

/** When the pull request ended, in the state it is in: GitHub's date, else the one already known. */
function endDates(
  prState: Ticket['prState'],
  status: PullRequestStatus | null,
  ticket: Ticket,
): Pick<Ticket, 'prMergedAt' | 'prClosedAt'> {
  return {
    prMergedAt: prState === 'merged' ? (status?.mergedAt ?? ticket.prMergedAt) : null,
    prClosedAt: prState === 'closed' ? (status?.closedAt ?? ticket.prClosedAt) : null,
  };
}

type Polled = Pick<Ticket, 'prState' | 'prMergedAt' | 'prClosedAt' | 'behindBy'>;

/**
 * What GitHub says of the ticket's pull request now, with the branch it targets; what is known
 * already when it is settled.
 */
async function polled(
  api: GitHubApi,
  repo: RepoRef,
  ticket: Ticket,
): Promise<Polled & { base?: string }> {
  const settled = ticket.prState === 'merged' && ticket.prMergedAt !== null;
  const status =
    ticket.prNumber === null || settled
      ? null
      : await api.pullRequestStatus(repo, ticket.prNumber, canRebase(ticket));
  const prState = ticket.prNumber === null ? null : (status?.state ?? ticket.prState);
  return {
    prState,
    ...endDates(prState, status, ticket),
    behindBy: status?.behindBy ?? null,
    ...(status?.base === undefined ? {} : { base: status.base }),
  };
}

/**
 * Keeps the pull request's state (`pr_state`), when it was merged (`pr_merged_at`) or closed
 * without a merge (`pr_closed_at`, polled still: it can be reopened) and, for tickets
 * that could be rebased, how far behind it is (`behind_by`) current. A merged pull request is final,
 * so once its merge date is known it is no longer asked about. An event is recorded only on a change,
 * so the panel and the board refresh. The open pull request's CI checks are read after.
 */
export async function refreshPullRequest(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  ticket: Ticket,
): Promise<void> {
  const settled = ticket.prState === 'merged' && ticket.prMergedAt !== null;
  const stack = settled
    ? null
    : await pollStack(db, api, { repo, ticket, behind: canRebase(ticket) });
  const status = stack ?? (await polled(api, repo, ticket));
  storeStatus(db, ticket, status);
  if (stack === null && 'base' in status) {
    await followBase(db, api, repo, { ticket: { ...ticket, ...status }, base: status.base });
  }
  if (stack?.restack) {
    startRestack(db, ticket.id);
  }
  // A stack's top pull request may target a branch other than the default one: its Closes did nothing.
  if (stack?.prState === 'merged' && ticket.issueNumber !== null) {
    await api.closeIssue(repo, ticket.issueNumber);
  }
  await refreshChecks(db, api, repo, { ...ticket, ...status });
}

function storeStatus(db: Db, ticket: Ticket, status: Polled): void {
  const { prState, prMergedAt, prClosedAt, behindBy } = status;
  if (
    prState === ticket.prState &&
    prMergedAt === ticket.prMergedAt &&
    prClosedAt === ticket.prClosedAt &&
    behindBy === ticket.behindBy
  ) {
    return;
  }
  db.update(schema.tickets)
    .set({ prState, prMergedAt, prClosedAt, behindBy })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  emitEvent(db, {
    type: 'pull_request_status',
    ticketId: ticket.id,
    payload: { prState, prMergedAt, prClosedAt, behindBy },
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
