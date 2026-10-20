// What a command needs besides a valid move of the state machine: a startable ticket, an open pull request, stacks turned on.
import { schema, type Db } from '@union/core';
import { eq } from 'drizzle-orm';

import type { CommandType, TicketSummary } from '../api-types';
import { CONFLICT, fail } from '../http';
import { assertStartable } from './ticket-links';

/** Split into a stack is offered only on projects that turned stacks on, while they are built. */
function stacksOn(db: Db, projectId: number): boolean {
  const project = db
    .select({ config: schema.projects.config })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  return project?.config.stacks === true;
}

function assertOpenPullRequest(ticket: TicketSummary, what: string): void {
  if (ticket.branch === null || ticket.prState !== 'open') {
    throw fail(CONFLICT, `Nothing to ${what}: the ticket has no open pull request`);
  }
}

/** Refuses a command the ticket cannot take now; the state machine has already allowed it. */
export function assertCommandFits(db: Db, ticket: TicketSummary, type: CommandType): void {
  if (type === 'start') {
    assertStartable(db, ticket);
  }
  // The worker knows the PR is open (and how far behind it is) from GitHub: no count, no rebase.
  if (type === 'rebase' && (ticket.branch === null || ticket.behindBy === null)) {
    throw fail(
      CONFLICT,
      'Nothing to rebase: the ticket has no open pull request (or it was not checked yet)',
    );
  }
  if (type === 'simplify') {
    assertOpenPullRequest(ticket, 'simplify');
  }
  if (type === 'split') {
    if (!stacksOn(db, ticket.projectId)) {
      throw fail(
        CONFLICT,
        'Stacks are off for this project: turn them on in its Pull requests settings',
      );
    }
    assertOpenPullRequest(ticket, 'split');
  }
}
