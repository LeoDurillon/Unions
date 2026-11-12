// Where a stack stands: which slices merged and into what, and the base each reader compares with.

/** A slice as the status reads it, bottom first. */
export type StackSlice = {
  position: number;
  branch: string;
  tipSha: string;
  prState: 'open' | 'closed' | 'merged' | null;
  mergedInto: string | null;
};

export type StackStatus = {
  total: number;
  merged: number;
  /** Merged into the branch of another slice: its code is not in the base. */
  outOfOrder: number[];
  /** Closed without a merge: the stack stops there until Restack folds or drops it. */
  closed: number[];
  /** Every slice merged into the project's base: the ticket is merged. */
  complete: boolean;
};

/** The lower slices' branch: `<branch>-s<position>`; the top slice is the ticket's own branch. */
export function sliceBranch(ticketBranch: string, position: number, count: number): string {
  return position === count ? ticketBranch : `${ticketBranch}-s${position}`;
}

export function stackStatus(slices: readonly StackSlice[], base: string): StackStatus {
  const merged = slices.filter((slice) => slice.prState === 'merged');
  const outOfOrder = merged
    .filter((slice) => slice.mergedInto !== base)
    .map((slice) => slice.position);
  const closed = slices.filter((slice) => slice.prState === 'closed').map((s) => s.position);
  return {
    total: slices.length,
    merged: merged.length,
    outOfOrder,
    closed,
    complete: slices.length > 0 && merged.length === slices.length && outOfOrder.length === 0,
  };
}

/** The card's line: `Stack of 3 · 1 merged`. */
export function stackLabel(status: StackStatus): string {
  return status.merged === 0
    ? `Stack of ${status.total}`
    : `Stack of ${status.total} · ${status.merged} merged`;
}

/** The lowest slice not merged yet: the one whose pull request targets the base. */
export function bottomOpen(slices: readonly StackSlice[]): StackSlice | null {
  return slices.find((slice) => slice.prState !== 'merged') ?? null;
}

/**
 * What a slice's own change is compared with: the tip of the slice below, or the base for the
 * bottom one. The review page, the CI checks and the PR description read one slice this way;
 * `behind_by` and a rebase read the bottom open slice against the base (`bottomOpen`).
 */
export function sliceRange(
  slices: readonly StackSlice[],
  position: number,
  base: string,
): { from: string; to: string } | null {
  const at = slices.findIndex((slice) => slice.position === position);
  const slice = slices[at];
  if (slice === undefined) {
    return null;
  }
  const below = slices[at - 1];
  return { from: below === undefined ? base : below.tipSha, to: slice.tipSha };
}

/** The base a slice's pull request targets: the project's for the bottom open one, else the branch below. */
export function slicePrBase(
  slices: readonly StackSlice[],
  position: number,
  base: string,
): string | null {
  const at = slices.findIndex((slice) => slice.position === position);
  if (at === -1) {
    return null;
  }
  const below = slices.slice(0, at).findLast((slice) => slice.prState !== 'merged');
  return below === undefined ? base : below.branch;
}
