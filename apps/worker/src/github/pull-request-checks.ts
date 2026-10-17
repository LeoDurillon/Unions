// Keeps the CI checks' state of the ticket's open pull request current, and logs when they turn red.
import { emitEvent, schema, type Db, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, RepoRef } from './api';

type Checks = Pick<Ticket, 'prChecksState' | 'prChecksSha'>;

const NONE: Checks = { prChecksState: null, prChecksSha: null };

/**
 * Whether the checks just turned red: on a commit already seen without red checks, or on a new head.
 * The first time a ticket's checks are read says nothing, so a deploy does not notify the past.
 */
function turnedRed(before: Checks, after: Checks): boolean {
  return (
    after.prChecksState === 'failure' &&
    before.prChecksSha !== null &&
    (before.prChecksState !== 'failure' || before.prChecksSha !== after.prChecksSha)
  );
}

async function read(api: GitHubApi, repo: RepoRef, ticket: Ticket): Promise<Checks> {
  if (ticket.prState !== 'open' || ticket.prNumber === null) {
    return NONE;
  }
  const checks = await api.pullRequestChecks(repo, ticket.prNumber);
  return checks ? { prChecksState: checks.state, prChecksSha: checks.sha } : NONE;
}

/**
 * Reads the checks of the open pull request's head and stores them on a change, logging
 * `pull_request_checks_changed`, and `pull_request_checks_failed` when they turned red. `ticket`
 * holds the pull request's state just polled; its checks are the ones stored before.
 */
export async function refreshChecks(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  ticket: Ticket,
): Promise<void> {
  const after = await read(api, repo, ticket);
  if (after.prChecksState === ticket.prChecksState && after.prChecksSha === ticket.prChecksSha) {
    return;
  }
  db.update(schema.tickets).set(after).where(eq(schema.tickets.id, ticket.id)).run();
  emitEvent(db, { type: 'pull_request_checks_changed', ticketId: ticket.id, payload: after });
  if (after.prChecksSha !== null && ticket.prNumber !== null && turnedRed(ticket, after)) {
    emitEvent(db, {
      type: 'pull_request_checks_failed',
      ticketId: ticket.id,
      payload: { number: ticket.prNumber, sha: after.prChecksSha },
    });
  }
}
