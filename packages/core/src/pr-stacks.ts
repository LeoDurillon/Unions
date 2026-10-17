// Pull requests stacked on each other: one targets the branch of the one below. Pure and browser-safe.

/** What a stack is read from: a pull request's branches, and whether its head is in a fork. */
export type StackMember = {
  number: number;
  headBranch: string;
  baseBranch: string;
  /** Its head branch is in a fork: no pull request of the repository can target it. */
  crossRepository?: boolean;
};

/** The pull request each one sits on, when it is in the list. */
function parents<T extends StackMember>(pulls: T[]): Map<T, T> {
  const byHead = new Map<string, T>();
  for (const pull of pulls) {
    if (pull.crossRepository !== true && !byHead.has(pull.headBranch)) {
      byHead.set(pull.headBranch, pull);
    }
  }
  const result = new Map<T, T>();
  for (const pull of pulls) {
    const parent = byHead.get(pull.baseBranch);
    if (parent && parent !== pull) {
      result.set(pull, parent);
    }
  }
  return result;
}

function childrenOf<T>(parentOf: Map<T, T>): Map<T, T[]> {
  const children = new Map<T, T[]>();
  for (const [child, parent] of parentOf) {
    children.set(parent, [...(children.get(parent) ?? []), child]);
  }
  return children;
}

/**
 * The pull requests grouped by stack, each bottom first: a pull request then the ones on it (two on
 * the same one follow each other). A pull request on no other and under none is a stack of one.
 * Stacks keep the list's order, each where its first listed member is.
 */
export function pullRequestStacks<T extends StackMember>(pulls: T[]): T[][] {
  const parentOf = parents(pulls);
  const children = childrenOf(parentOf);
  const placed = new Set<T>();
  const collect = (pull: T, stack: T[]): T[] => {
    if (!placed.has(pull)) {
      placed.add(pull);
      stack.push(pull);
      for (const child of children.get(pull) ?? []) {
        collect(child, stack);
      }
    }
    return stack;
  };
  const stacks = pulls.filter((pull) => !parentOf.has(pull)).map((root) => collect(root, []));
  // Branches that target each other in a ring have no bottom: each ring starts where it is listed.
  for (const pull of pulls) {
    if (!placed.has(pull)) {
      stacks.push(collect(pull, []));
    }
  }
  const position = new Map(pulls.map((pull, index) => [pull, index]));
  const first = (stack: T[]): number =>
    Math.min(...stack.map((pull) => position.get(pull) ?? pulls.length));
  return stacks.toSorted((a, b) => first(a) - first(b));
}
