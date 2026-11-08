// One runner for the review side runs: claims within the run slots, checks the change out, runs the kind's work with the hunk index, finishes, recovers.

import { reviewRunExists, type ReviewRunKind } from '@union/core';

import { removeRunContainers } from '../janitor';
import type { TicketContainer } from '../provision';
import { RunPool } from '../run-pool';
import type { AgentReviewDeps } from './agent-review';
import type { ReviewRun, ReviewTarget } from './agent-review-target';
import { withHunkIndex, type ChangedFile } from './hunk-index-file';
import { sideReviewContainer, type SideReviewLetter } from './names';

/** What every checkout gives the engine: where the agent runs, and how it goes. */
type Checkout = { container: string; close: () => Promise<void> };

/** What a kind of review side run is: its rows, its container letter, its checkout and its own work. */
export type SideReviewKind<
  Row extends ReviewRun,
  Outcome,
  Target extends Checkout = ReviewTarget,
> = {
  kind: ReviewRunKind;
  letter: SideReviewLetter;
  claim: (deps: AgentReviewDeps) => Row | null;
  finish: (deps: AgentReviewDeps, row: Row, outcome: Outcome) => void;
  failInterrupted: (deps: AgentReviewDeps) => Row[];
  cancelled: Outcome;
  failed: (error: string) => Outcome;
  /** The checkout: the ticket's container, or the pull request in a throwaway one (`openTarget`). */
  open: (deps: AgentReviewDeps, row: Row, names: TicketContainer) => Promise<Target>;
  /**
   * False when the kind's prompt does not use the hunk index: the target is only opened and closed.
   * Only a full `ReviewTarget` (its paths and patches) gets one.
   */
  hunkIndex?: boolean;
  /** Which interrupted runs left a throwaway container: those on a pull request, or every one. */
  throwaway?: 'pull_requests' | 'all';
  /** The kind's work, with the change checked out and its hunk index written; the target closes after. */
  work: (
    deps: AgentReviewDeps,
    run: { row: Row; target: Target; files: ChangedFile[]; signal: AbortSignal },
  ) => Promise<Outcome>;
};

/** How every kind's runs end when cancelled or when their work threw: spread into a kind. */
export const STANDARD_ENDS = {
  cancelled: { status: 'cancelled' },
  failed: (error: string) => ({ status: 'failed' as const, error }),
} as const;

function isReviewTarget(target: Checkout): target is ReviewTarget {
  return 'paths' in target && 'patchOf' in target;
}

async function runOne<Row extends ReviewRun, Outcome, Target extends Checkout>(
  deps: AgentReviewDeps,
  kind: SideReviewKind<Row, Outcome, Target>,
  row: Row,
  signal: AbortSignal,
): Promise<Outcome> {
  const names = sideReviewContainer(kind.letter, row.id);
  const target = await kind.open(deps, row, names);
  const work = (files: ChangedFile[]): Promise<Outcome> =>
    signal.aborted
      ? Promise.resolve(kind.cancelled)
      : kind.work(deps, { row, target, files, signal });
  if (kind.hunkIndex !== false && isReviewTarget(target)) {
    return withHunkIndex(deps.runtime, target, work);
  }
  try {
    return await work([]);
  } finally {
    await target.close();
  }
}

/** The runner of one kind of review side run, on the run slots the pipeline shares. */
export class SideReviewRunner<
  Row extends ReviewRun,
  Outcome,
  Target extends Checkout = ReviewTarget,
> extends RunPool<Row, Outcome> {
  constructor(
    private readonly deps: AgentReviewDeps,
    private readonly kind: SideReviewKind<Row, Outcome, Target>,
  ) {
    super({
      slots: deps.slots,
      claim: () => kind.claim(deps),
      run: (row, signal) => runOne(deps, kind, row, signal),
      failed: kind.failed,
      stopped: kind.cancelled,
      finish: (row, outcome) => {
        kind.finish(deps, row, outcome);
      },
      exists: (id) => reviewRunExists(deps.db, kind.kind, id),
    });
  }

  /** Fails the runs a stopped worker left running and removes the throwaway containers they had. */
  async recover(): Promise<void> {
    const left = this.kind.failInterrupted(this.deps);
    const thrown =
      this.kind.throwaway === 'all' ? left : left.filter((run) => run.reviewId !== null);
    const containers = thrown.map((run) => sideReviewContainer(this.kind.letter, run.id));
    await removeRunContainers(this.deps.db, this.deps.runtime, containers);
  }
}
