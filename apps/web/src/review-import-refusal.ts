// When a tracker's comment (a Notion discussion, a Jira comment) can go into a ticket's review: once it is implemented.
import type { Ticket } from '@union/core';

/** Why a tracker's comment cannot go into the ticket's review now, or null when it can. */
export function reviewImportRefusal(ticket: Ticket): string | null {
  if (ticket.branch === null) {
    return 'Available once the ticket is implemented';
  }
  return ticket.prState === 'merged' ? 'The pull request is merged' : null;
}
