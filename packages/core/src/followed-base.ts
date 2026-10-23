// When the ticket's pull request targets another branch on GitHub than the ticket's base: the base to follow.
import type { Ticket } from './tickets';

export type BaseFollow = { from: string; to: string };

/** Phases that run nothing now and none paused mid-step: a refused commit or a rate limit resumes. */
function settled(phase: Ticket['phase']): boolean {
  return phase.kind === 'awaiting_approval' || phase.kind === 'done' || phase.kind === 'failed';
}

/**
 * The base GitHub moved the open pull request onto, when it differs from the ticket's; null when
 * there is nothing to follow, or not now (a step running or paused, or a split ticket, whose stack
 * follows GitHub on its own).
 */
export function baseToFollow(
  ticket: Pick<Ticket, 'phase' | 'baseBranch' | 'prState'>,
  pull: { base: string | undefined; projectBase: string; split: boolean },
): BaseFollow | null {
  const from = ticket.baseBranch ?? pull.projectBase;
  const to = pull.base;
  if (to === undefined || to === from || ticket.prState !== 'open') {
    return null;
  }
  return settled(ticket.phase) && !pull.split ? { from, to } : null;
}
