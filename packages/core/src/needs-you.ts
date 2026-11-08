// Whether a ticket waits on the user: the rule the board's Needs you filter, `n` and the sidebar's counts share.

/** What the rule reads of a ticket. */
export type NeedsYouFields = {
  phase: { kind: string };
  prState: string | null;
  prChecksState: string | null;
};

/** It waits on the user: a step to approve, a failure or a refused commit, red CI checks. */
export function needsYou(ticket: NeedsYouFields): boolean {
  const { kind } = ticket.phase;
  if (kind === 'awaiting_approval' || kind === 'failed' || kind === 'commit_refused') {
    return true;
  }
  return ticket.prState === 'open' && ticket.prChecksState === 'failure';
}
