// Whether a pull request's branch can be rewritten now (rebase, simpler history, split, new target), and why not.

import type { TicketDetail } from '../../../src/api-types';

/**
 * Why the branch cannot be rewritten now (a rebase, a simpler history, a split, a new target); null
 * when it can: the ticket waits on its final review, or is done with the PR open, and the branch on
 * GitHub is the one Union pushed.
 */
export function rewriteBlock(detail: TicketDetail): string | null {
  const { phase, remoteMoved } = detail.ticket;
  if (remoteMoved !== null) {
    return 'The branch moved on GitHub: resync it first';
  }
  const ready =
    phase.kind === 'done' || (phase.kind === 'awaiting_approval' && phase.step === 'final_review');
  return ready ? null : 'Available at the final review, or once done';
}

export function canRewrite(detail: TicketDetail): boolean {
  return rewriteBlock(detail) === null;
}
