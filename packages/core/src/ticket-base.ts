import { eq } from 'drizzle-orm';

import type { Db } from './db';
import * as schema from './schema';
import { transition } from './states';
import { TicketLinkError } from './ticket-links';
import { emitEvent, getTicket, type Ticket } from './tickets';

/** A branch name git accepts, without the rare forms (`..`, a leading `-` or `.`, a trailing `/`). */
const BRANCH_NAME = /^[\w][\w./-]*$/u;

export function isBranchName(name: string): boolean {
  return (
    BRANCH_NAME.test(name) && !name.includes('..') && !name.endsWith('/') && !name.endsWith('.')
  );
}

/**
 * Chooses the branch the ticket starts from, over its parent's and the project's (null: back to
 * the automatic choice). Only before it starts: the branch is fixed at its first clone.
 */
export function chooseBaseBranch(db: Db, ticketId: number, branch: string | null): Ticket {
  const ticket = getTicket(db, ticketId);
  if (ticket.phase.kind !== 'backlog') {
    throw new TicketLinkError('The base branch can only change before the ticket starts');
  }
  const trimmed = branch?.trim() ?? '';
  const chosen = trimmed === '' ? null : trimmed;
  if (chosen !== null && !isBranchName(chosen)) {
    throw new TicketLinkError(`"${chosen}" is not a branch name`);
  }
  return db.transaction((tx) => {
    const updated = tx
      .update(schema.tickets)
      .set({ chosenBaseBranch: chosen })
      .where(eq(schema.tickets.id, ticketId))
      .returning()
      .get();
    emitEvent(tx, { type: 'ticket_base_chosen', ticketId, payload: { branch: chosen } });
    return updated;
  });
}

/** Why the ticket starts from its branch: the user chose it, it is the parent's, or the project's. */
export type BaseReason = 'chosen' | 'parent' | 'project';

export type TicketBaseView = {
  /** Null only for a parent's branch not pushed yet. */
  branch: string | null;
  reason: BaseReason;
  /** Set at the first clone: the ticket started. */
  fixed: boolean;
};

function parentPullOpen(parent: Ticket): boolean {
  return parent.prState !== 'merged' && parent.prState !== 'closed';
}

/** The base a ticket that has not started yet will take, as far as known now. */
function plannedBase(ticket: Ticket, parent: Ticket | null, projectBase: string): TicketBaseView {
  if (ticket.chosenBaseBranch !== null) {
    return { branch: ticket.chosenBaseBranch, reason: 'chosen', fixed: false };
  }
  if (parent && parentPullOpen(parent)) {
    return { branch: parent.branch, reason: 'parent', fixed: false };
  }
  return { branch: projectBase, reason: 'project', fixed: false };
}

/** The branch the ticket starts from and why; before it starts, the one it would take now. */
export function describeTicketBase(
  ticket: Ticket,
  parent: Ticket | null,
  projectBase: string,
): TicketBaseView {
  if (ticket.phase.kind === 'backlog') {
    return plannedBase(ticket, parent, projectBase);
  }
  const { baseBranch } = ticket;
  if (baseBranch === null) {
    return { branch: projectBase, reason: 'project', fixed: true };
  }
  // A base other than the project's is the user's choice, else the parent's branch.
  const reason = baseBranch === ticket.chosenBaseBranch ? 'chosen' : 'parent';
  return { branch: baseBranch, reason, fixed: true };
}

/**
 * Keeps the branch a change of target moves the ticket onto, for the run and its retries. Refused
 * when the ticket cannot be retargeted now, or the name is not a branch's.
 */
export function chooseRetarget(db: Db, ticketId: number, branch: string): Ticket {
  const ticket = getTicket(db, ticketId);
  transition(ticket.phase, { type: 'retarget' });
  if (!isBranchName(branch)) {
    throw new TicketLinkError(`"${branch}" is not a branch name`);
  }
  return db
    .update(schema.tickets)
    .set({ retargetBranch: branch })
    .where(eq(schema.tickets.id, ticketId))
    .returning()
    .get();
}
