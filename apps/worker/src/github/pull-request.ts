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
