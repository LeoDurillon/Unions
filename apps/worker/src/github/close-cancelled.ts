// A cancelled ticket's GitHub side: its open pull requests closed, its issue closed as not planned, once.
import { emitEvent, listSlices, schema, type Db, type Ticket } from '@union/core';
import { and, eq } from 'drizzle-orm';

import type { GitHubApi, RepoRef } from './api';

/** The ticket's pull requests, a stack's top first: nothing is closed under one still open above it. */
function pullRequestNumbers(db: Db, ticket: Ticket): number[] {
  const slices = listSlices(db, ticket.id).map((slice) => slice.prNumber);
  const numbers = [...slices.toReversed(), ticket.prNumber];
  return [...new Set(numbers.filter((number) => number !== null))];
}

function isStopping(db: Db, ticketId: number): boolean {
  const running = db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(and(eq(schema.runs.ticketId, ticketId), eq(schema.runs.status, 'running')))
    .get();
  return running !== undefined;
}

/**
 * Closes what a cancelled ticket has on GitHub, once its agent stopped (a step ending could still
 * open a pull request). State is asked of GitHub: what is merged stays merged. Done once only, so
 * what the user reopens by hand stays open; a failure is retried by the next push.
 */
export async function closeWhenCancelled(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  ticket: Ticket,
): Promise<void> {
  if (
    ticket.phase.kind !== 'cancelled' ||
    ticket.githubClosedAt !== null ||
    isStopping(db, ticket.id)
  ) {
    return;
  }
  const pullRequests: number[] = [];
  for (const number of pullRequestNumbers(db, ticket)) {
    const status = await api.pullRequestStatus(repo, number, false);
    if (status?.state === 'open') {
      await api.closePullRequest(repo, number);
      pullRequests.push(number);
    }
  }
  if (ticket.issueNumber !== null) {
    await api.closeIssue(repo, ticket.issueNumber, 'not_planned');
  }
  db.update(schema.tickets)
    .set({ githubClosedAt: Date.now() })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  emitEvent(db, {
    type: 'ticket_closed_on_github',
    ticketId: ticket.id,
    payload: { issueNumber: ticket.issueNumber, pullRequests },
  });
}
