// Whether a ticket waits on the user, and whether a notification still asks something of them. The
// first is the rule the board's Needs you filter, `n` and the sidebar's counts share; the second,
// the bell's count.

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

/** What `toAct` reads of a notification. */
export type ToActFields = { kind: string; readAt: number | null };

/** About a ticket's step, failure or red CI: they ask something while the ticket still needs the user. */
const ABOUT_TICKET: ReadonlySet<string> = new Set([
  'awaiting_approval',
  'failed',
  'commit_refused',
  'pull_request_checks_failed',
  'ci_rerun_failed',
]);

/** They tell, and ask nothing: merged, closed, and a usage limit (Union retries it by itself). */
const TELLS: ReadonlySet<string> = new Set([
  'pull_request_merged',
  'pull_request_closed',
  'rate_limited',
]);

/**
 * Whether a notification still asks something of the user: unread, and about a ticket that still needs
 * them (`ticket`: null once it is gone), or of a kind that asks until it is read (an investigation's answer
 * or failure, a refused start, a rule's message or failure). The bell counts these.
 */
export function toAct(notification: ToActFields, ticket: NeedsYouFields | null): boolean {
  if (notification.readAt !== null || TELLS.has(notification.kind)) {
    return false;
  }
  if (ABOUT_TICKET.has(notification.kind)) {
    return ticket !== null && needsYou(ticket);
  }
  return true;
}
