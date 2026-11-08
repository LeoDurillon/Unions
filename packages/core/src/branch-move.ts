// When a ticket's branch moved on GitHub away from what Union last pushed, and what that holds back until a resync; browser-safe.

import type { Phase } from './phases';
import type { BranchMove } from './schema/schema-types';

/** GitHub's comparison of what Union pushed with the branch's head now (`compare/<pushed>...<head>`). */
export type Comparison = 'ahead' | 'behind' | 'diverged' | 'identical';

/**
 * How the branch moved; null when it did not. `steady`: the head was already this one at the poll
 * before. A head behind what Union pushed is most often GitHub not caught up with Union's push yet,
 * so it counts only when it stays. An unknown comparison (GitHub no longer has the pushed commit)
 * is a rewrite.
 */
export function moveKind(
  comparison: Comparison | null,
  steady: boolean,
): BranchMove['kind'] | null {
  if (comparison === 'identical') {
    return null;
  }
  if (comparison === 'ahead') {
    return 'ahead';
  }
  return comparison === 'behind' && !steady ? null : 'diverged';
}

/** A step works on the branch, or waits to go on: its workspace is not Union's to compare or reset. */
export function stepHoldsBranch(phase: Phase): boolean {
  return (
    phase.kind === 'running' || phase.kind === 'rate_limited' || phase.kind === 'commit_refused'
  );
}

/** The actions that rewrite or push the branch: a moved branch must be resynced before them. */
const BRANCH_WRITERS = new Set([
  'rebase',
  'revise',
  'retry',
  'simplify',
  'split',
  'restack',
  'retarget',
]);

/** Why `action` must wait for a resync; null when it need not. */
export function movedBranchRefusal(
  ticket: { remoteMoved: BranchMove | null },
  action: string,
): string | null {
  if (ticket.remoteMoved === null || !BRANCH_WRITERS.has(action)) {
    return null;
  }
  return 'The branch moved on GitHub since Union pushed it: resync it from the Pull request tab first';
}

/** Why the branch cannot be resynced now; null when it can. */
export function resyncRefusal(
  ticket: { remoteMoved: BranchMove | null; phase: Phase; branch: string | null },
  split: boolean,
): string | null {
  if (ticket.remoteMoved === null || ticket.branch === null) {
    return 'The branch on GitHub is the one Union pushed: nothing to resync';
  }
  if (stepHoldsBranch(ticket.phase)) {
    return 'A step is working on the branch: resync once it ends';
  }
  if (split) {
    return 'The ticket is split into a stack: resyncing its slices is not supported yet';
  }
  return null;
}
