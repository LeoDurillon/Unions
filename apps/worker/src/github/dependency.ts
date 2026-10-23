// Mirrors the ticket's parent as "blocked by" on its issue, once both issues exist.
import { emitEvent, parentOf, schema, type Db, type Ticket } from '@union/core';
import { eq } from 'drizzle-orm';

import type { GitHubApi, RepoRef } from './api';

/**
 * Mirrors the ticket's parent as "blocked by" on its issue, once both issues exist. Local links
 * win: a relation edited on GitHub is not pulled back, and only the one Union added is removed.
 */
export async function pushDependency(
  db: Db,
  api: GitHubApi,
  repo: RepoRef,
  ticket: Ticket,
): Promise<void> {
  if (ticket.issueNumber === null) {
    return;
  }
  const desired = parentOf(db, ticket)?.issueNumber ?? null;
  const mirrored = ticket.githubBlockedBy;
  if (desired === mirrored) {
    return;
  }
  if (mirrored !== null) {
    await api.removeBlockedBy(repo, ticket.issueNumber, mirrored);
  }
  if (desired !== null) {
    const existing = await api.listBlockedBy(repo, ticket.issueNumber);
    if (!existing.includes(desired)) {
      await api.addBlockedBy(repo, ticket.issueNumber, desired);
    }
  }
  db.update(schema.tickets)
    .set({ githubBlockedBy: desired })
    .where(eq(schema.tickets.id, ticket.id))
    .run();
  emitEvent(db, {
    type: 'github_dependency_synced',
    ticketId: ticket.id,
    payload: { blockedBy: desired, removed: mirrored },
  });
}
