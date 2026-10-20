// A split ticket's stack, as the API sends it with the ticket.
/** A split ticket's stack as the board card and the PR tab show it. */
export type StackView = {
  /** `Stack of 3 · 1 merged`. */
  label: string;
  slices: {
    position: number;
    title: string;
    branch: string;
    prNumber: number | null;
    prState: 'open' | 'closed' | 'merged' | null;
    mergedInto: string | null;
  }[];
  /** Merged into another slice's branch: their code is not in the base. */
  outOfOrder: number[];
  /** Closed without a merge: the stack stops there. */
  closed: number[];
  /** GitHub's own stack over the pull requests; null: Union keeps the stack alone. */
  githubStack: number | null;
  /** A slice merged into the base and the rest not moved onto it yet. */
  restackable: boolean;
};
