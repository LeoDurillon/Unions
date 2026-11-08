// A ticket imported from a pull request: its branch checked out in the ticket's container and its diff captured, so the Changes tab shows the pull request; no agent, no push.
import { emitEvent, getTicket, stepHoldsBranch, ticketBase } from '@union/core';

import { captureDiff } from './diff-snapshot';
import { ensureTicketContainer } from './provision';
import type { ResyncDeps } from './resync-branch';
import { loadProject } from './review';
import { ensureBranch } from './workspace-git';

/**
 * Checks the pull request's branch out and captures its diff, in the ticket's container (stopped
 * after unless a step started meanwhile). A failure is an event; the ticket waits all the same.
 */
export async function showAdoptedPullRequest(deps: ResyncDeps, ticketId: number): Promise<void> {
  const { db, runtime, config } = deps;
  try {
    const ticket = getTicket(db, ticketId);
    if (ticket.branch === null) {
      throw new Error('The ticket has no branch');
    }
    const { name } = await ensureTicketContainer(db, runtime, config, ticket);
    try {
      // Re-read: the first clone has just chosen the base.
      const base = ticketBase(loadProject(db, ticket.projectId), getTicket(db, ticketId));
      await ensureBranch(runtime, name, ticket.branch, base);
      await captureDiff(db, runtime, { container: name, ticketId, base });
    } finally {
      if (!stepHoldsBranch(getTicket(db, ticketId).phase)) {
        await runtime.stop(name);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitEvent(db, { type: 'pull_request_adopt_failed', ticketId, payload: { error: message } });
  }
}
